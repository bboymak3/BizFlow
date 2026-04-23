// ============================================================
// BizFlow - Upload Media (Generic R2 Upload)
// POST /api/upload-media
// Sube cualquier archivo a Cloudflare R2
// Tipos: foto_ot, firma, avatar, logo, landing_bg, landing_image,
//         documento, comprobante, otro
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO, getUserIdFromRequest } from '../../lib/db-helpers.js';
import { subirArchivoR2, base64ToArrayBuffer, generarRutaFotoOT, generarRutaFirma, generarRutaAvatar, generarRutaLanding, generarRutaDocumento } from '../../lib/r2-helpers.js';

const VALID_TYPES = [
  'foto_ot', 'firma', 'avatar', 'logo', 'landing_bg',
  'landing_image', 'documento', 'comprobante', 'otro'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB base64

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
    if (!body.archivo_base64 || !body.tipo_recurso) {
      return errorResponse('Campos obligatorios: archivo_base64, tipo_recurso');
    }

    const {
      archivo_base64,
      tipo_recurso,
      recurso_id,
      descripcion = '',
      orden_id,
      tecnico_id,
      landing_id,
      mime_type,
    } = body;

    // Validate type
    if (!VALID_TYPES.includes(tipo_recurso)) {
      return errorResponse(`tipo_recurso inválido. Valores: ${VALID_TYPES.join(', ')}`);
    }

    // Validate size
    const base64Clean = archivo_base64.replace(/^data:[a-z]+\/[a-z]+;base64,/, '');
    if (base64Clean.length > MAX_FILE_SIZE) {
      return errorResponse(`Archivo muy grande. Máximo: 10MB`);
    }

    // Get user
    const userId = await getUserIdFromRequest(request, env.DB);

    // Determine extension and mime type
    const mimeType = mime_type || detectMimeType(base64Clean);
    let extension = 'jpg';
    if (mimeType.includes('png')) extension = 'png';
    else if (mimeType.includes('webp')) extension = 'webp';
    else if (mimeType.includes('gif')) extension = 'gif';
    else if (mimeType.includes('pdf')) extension = 'pdf';

    // Convert to buffer
    const buffer = base64ToArrayBuffer(archivo_base64);

    // Generate R2 path based on type
    let rutaR2;
    switch (tipo_recurso) {
      case 'foto_ot':
        rutaR2 = generarRutaFotoOT(parseInt(orden_id) || 0, descripcion || 'evidencia', extension);
        break;
      case 'firma':
        rutaR2 = generarRutaFirma(parseInt(orden_id) || 0, descripcion || 'cliente');
        break;
      case 'avatar':
        rutaR2 = generarRutaAvatar(parseInt(recurso_id) || userId || 0, extension);
        break;
      case 'logo':
        rutaR2 = generarRutaLanding(parseInt(landing_id) || 0, 'logo', extension);
        break;
      case 'landing_bg':
        rutaR2 = generarRutaLanding(parseInt(landing_id) || 0, 'bg', extension);
        break;
      case 'landing_image':
        rutaR2 = generarRutaLanding(parseInt(landing_id) || 0, 'imagen', extension);
        break;
      case 'documento':
        rutaR2 = generarRutaDocumento('documento', `${Date.now()}.${extension}`);
        break;
      case 'comprobante':
        rutaR2 = generarRutaDocumento('comprobante', `${Date.now()}.${extension}`);
        break;
      default:
        rutaR2 = `otros/${Date.now()}.${extension}`;
    }

    // Upload to R2
    const r2Result = await subirArchivoR2(env.MEDIA, rutaR2, buffer, {
      contentType: mimeType,
      metadata: {
        tipo_recurso,
        recurso_id: (recurso_id || '').toString(),
        usuario_id: (userId || '').toString(),
        descripcion,
      }
    });

    const now = hoyISO();

    // Register in MediosR2 table
    const medioResult = await env.DB.prepare(`
      INSERT INTO MediosR2 (usuario_id, ruta, nombre_original, mime_type, tamano_bytes,
        tipo_recurso, recurso_id, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      rutaR2,
      `${tipo_recurso}_${recurso_id || 'general'}_${Date.now()}.${extension}`,
      mimeType,
      buffer.byteLength || 0,
      tipo_recurso,
      recurso_id ? parseInt(recurso_id) : null,
      now
    ).run();

    const medio = await env.DB.prepare(
      'SELECT * FROM MediosR2 WHERE id = ?'
    ).bind(medioResult.meta.last_row_id).first();

    return jsonResponse({
      medio,
      url: r2Result.urlPublica,
      ruta: rutaR2,
      tamano_bytes: buffer.byteLength,
      mensaje: 'Archivo subido exitosamente a R2',
    }, 201);

  } catch (error) {
    console.error('Error uploading media to R2:', error);
    return errorResponse('Error al subir archivo: ' + error.message, 500);
  }
}

// Simple MIME type detection from base64 header
function detectMimeType(base64) {
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('JVBER')) return 'application/pdf';
  return 'image/jpeg';
}

// GET - List media for a resource type
export async function onRequestGet(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const url = new URL(request.url);
  const tipoRecurso = url.searchParams.get('tipo_recurso');
  const recursoId = url.searchParams.get('recurso_id');

  try {
    let query = 'SELECT * FROM MediosR2 WHERE 1=1';
    const params = [];

    if (tipoRecurso) {
      query += ' AND tipo_recurso = ?';
      params.push(tipoRecurso);
    }

    if (recursoId) {
      query += ' AND recurso_id = ?';
      params.push(parseInt(recursoId));
    }

    query += ' ORDER BY creado_en DESC LIMIT 100';

    const result = await env.DB.prepare(query).bind(...params).all();

    return jsonResponse({
      medios: result.results || [],
      total: (result.results || []).length,
    });

  } catch (error) {
    return errorResponse('Error listando medios: ' + error.message, 500);
  }
}

// DELETE - Delete media from R2 + D1
export async function onRequestDelete(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorResponse('ID es obligatorio');
  }

  try {
    // Get media record
    const medio = await env.DB.prepare(
      'SELECT * FROM MediosR2 WHERE id = ?'
    ).bind(parseInt(id)).first();

    if (!medio) {
      return errorResponse('Medio no encontrado', 404);
    }

    // Delete from R2
    try {
      await env.MEDIA.delete(medio.ruta);
    } catch (e) {
      console.warn('Could not delete from R2:', e.message);
    }

    // Delete from D1
    await env.DB.prepare('DELETE FROM MediosR2 WHERE id = ?').bind(parseInt(id)).run();

    return jsonResponse({ deleted: true, id: parseInt(id) });

  } catch (error) {
    return errorResponse('Error eliminando medio: ' + error.message, 500);
  }
}
