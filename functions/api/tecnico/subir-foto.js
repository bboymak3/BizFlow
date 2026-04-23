// ============================================
// BIZFLOW - Upload Photo (R2)
// POST /api/tecnico/subir-foto
// Subir foto de trabajo a Cloudflare R2
// Tipos: antes, durante, despues, diagnostico, repuesto, final
// ============================================

import { jsonResponse, errorResponse, handleCors, hoyISO } from '../../lib/db-helpers.js';
import { subirArchivoR2, generarRutaFotoOT, base64ToArrayBuffer } from '../../lib/r2-helpers.js';

// Max photo size: ~5MB base64 encoded
const MAX_PHOTO_SIZE = 7 * 1024 * 1024;

const VALID_TIPOS = ['antes', 'durante', 'despues', 'diagnostico', 'repuesto', 'final'];

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;

  if (request.method !== 'POST') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.orden_id || !body.tecnico_id || !body.foto_base64) {
      return errorResponse('Faltan campos obligatorios: orden_id, tecnico_id, foto_base64');
    }

    const { orden_id, tecnico_id, foto_base64, tipo = 'antes', descripcion = '' } = body;

    // Validate tipo
    if (!VALID_TIPOS.includes(tipo)) {
      return errorResponse(`Tipo de foto inválido. Valores: ${VALID_TIPOS.join(', ')}`);
    }

    // Validate base64
    if (!foto_base64 || typeof foto_base64 !== 'string') {
      return errorResponse('Datos de foto inválidos');
    }

    const base64Clean = foto_base64.replace(/^data:image\/[a-z]+;base64,/, '');

    if (base64Clean.length > MAX_PHOTO_SIZE) {
      return errorResponse(
        `Foto muy grande (${Math.round(base64Clean.length / 1024 / 1024)}MB). Máximo: 5MB`
      );
    }

    // 1. Verify order exists
    const orden = await env.DB.prepare(`
      SELECT id, usuario_id, estado FROM OrdenesTrabajo WHERE id = ?
    `).bind(parseInt(orden_id)).first();

    if (!orden) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // 2. Verify technician
    const tecnico = await env.DB.prepare(`
      SELECT id FROM Tecnicos WHERE id = ? AND activo = 1
    `).bind(parseInt(tecnico_id)).first();

    if (!tecnico) {
      return errorResponse('Técnico no encontrado o inactivo', 404);
    }

    // 3. Determine mime type and extension
    const mimeType = body.mime_type || 'image/jpeg';
    let extension = 'jpg';
    if (mimeType.includes('png')) extension = 'png';
    else if (mimeType.includes('webp')) extension = 'webp';
    else if (mimeType.includes('gif')) extension = 'gif';

    // 4. Convert base64 to ArrayBuffer
    const buffer = base64ToArrayBuffer(foto_base64);

    // 5. Generate R2 path and upload
    const rutaR2 = generarRutaFotoOT(parseInt(orden_id), tipo, extension);
    const r2Result = await subirArchivoR2(env.MEDIA, rutaR2, buffer, {
      contentType: mimeType,
      metadata: {
        orden_id: orden_id.toString(),
        tipo,
        tecnico_id: tecnico_id.toString(),
      }
    });

    // 6. Save metadata to D1 (FotosTrabajo)
    const now = hoyISO();
    const fotoResult = await env.DB.prepare(`
      INSERT INTO FotosTrabajo (orden_id, tipo, descripcion, ruta_r2, url_publica,
        subida_por, mime_type, tamano_bytes, creado_en)
      VALUES (?, ?, ?, ?, ?, 'tecnico', ?, ?, ?)
    `).bind(
      parseInt(orden_id),
      tipo,
      descripcion.trim() || '',
      rutaR2,
      r2Result.urlPublica,
      mimeType,
      buffer.byteLength || 0,
      now
    ).run();

    // 7. Also register in MediosR2 for centralized tracking
    await env.DB.prepare(`
      INSERT INTO MediosR2 (usuario_id, ruta, nombre_original, mime_type, tamano_bytes,
        tipo_recurso, recurso_id, creado_en)
      VALUES (?, ?, ?, ?, ?, 'foto_ot', ?, ?)
    `).bind(
      orden.usuario_id,
      rutaR2,
      `${tipo}_${orden_id}_${Date.now()}.${extension}`,
      mimeType,
      buffer.byteLength || 0,
      parseInt(orden_id),
      now
    ).run();

    const foto = await env.DB.prepare(
      'SELECT * FROM FotosTrabajo WHERE id = ?'
    ).bind(fotoResult.meta.last_row_id).first();

    return jsonResponse({
      foto,
      mensaje: 'Foto subida exitosamente a R2',
      url: r2Result.urlPublica,
    }, 201);

  } catch (error) {
    console.error('Error uploading photo to R2:', error);
    return errorResponse('Error al subir la foto: ' + error.message, 500);
  }
}
