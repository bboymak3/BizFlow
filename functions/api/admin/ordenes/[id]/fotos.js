// ============================================================
// BizFlow - Admin Ordenes [id] Fotos API
// GET: List photo metadata for order
// POST: Upload photo (base64 -> R2 -> D1 + MediosR2)
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO } from '../../../../lib/db-helpers.js';
import { subirArchivoR2, generarRutaFotoOT, base64ToArrayBuffer } from '../../../../lib/r2-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB, MEDIA } = env;
  const { id } = params;

  try {
    if (request.method === 'GET') {
      return await handleGet(DB, id);
    } else if (request.method === 'POST') {
      return await handlePost(request, DB, MEDIA, id);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Fotos error:', error);
    return errorResponse('Error en fotos: ' + error.message, 500);
  }
}

async function handleGet(DB, id) {
  const orden = await DB.prepare(
    'SELECT id, usuario_id FROM OrdenesTrabajo WHERE id = ?'
  ).bind(id).first();

  if (!orden) {
    return errorResponse('Orden no encontrada', 404);
  }

  const { results } = await DB.prepare(`
    SELECT * FROM FotosTrabajo WHERE orden_id = ? ORDER BY creado_en ASC
  `).bind(id).all();

  // Group by type
  const porTipo = {};
  for (const foto of (results || [])) {
    if (!porTipo[foto.tipo]) porTipo[foto.tipo] = [];
    porTipo[foto.tipo].push(foto);
  }

  return jsonResponse({
    fotos: results || [],
    fotos_por_tipo: porTipo,
    total: (results || []).length,
  });
}

async function handlePost(request, DB, MEDIA, id) {
  const orden = await DB.prepare(
    'SELECT id, estado, usuario_id FROM OrdenesTrabajo WHERE id = ?'
  ).bind(id).first();

  if (!orden) {
    return errorResponse('Orden no encontrada', 404);
  }

  const data = await request.json();
  const { foto_base64, tipo, descripcion, mime_type } = data;

  if (!foto_base64) {
    return errorResponse('foto_base64 es requerido');
  }

  // Validate photo type
  const tiposValidos = ['antes', 'durante', 'despues', 'evidencia', 'diagnostico', 'firma'];
  const tipoFoto = tiposValidos.includes(tipo) ? tipo : 'evidencia';

  // Determine extension from mime_type
  const mimeType = mime_type || 'image/jpeg';
  let extension = 'jpg';
  if (mimeType.includes('png')) extension = 'png';
  else if (mimeType.includes('webp')) extension = 'webp';
  else if (mimeType.includes('gif')) extension = 'gif';

  // Convert base64 to buffer
  const buffer = base64ToArrayBuffer(foto_base64);

  // Generate R2 path
  const ruta = generarRutaFotoOT(parseInt(id), tipoFoto, extension);

  // Upload to R2
  const r2Result = await subirArchivoR2(MEDIA, ruta, buffer, {
    contentType: mimeType,
    metadata: {
      orden_id: id,
      tipo: tipoFoto,
    }
  });

  // Save metadata to FotosTrabajo
  const fotoResult = await DB.prepare(`
    INSERT INTO FotosTrabajo (orden_id, tipo, descripcion, ruta_r2, url_publica,
      subida_por, mime_type, tamano_bytes)
    VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)
  `).bind(
    id, tipoFoto, descripcion?.trim() || '', ruta, r2Result.urlPublica,
    mimeType, buffer.byteLength || 0
  ).run();

  // Save to MediosR2
  await DB.prepare(`
    INSERT INTO MediosR2 (usuario_id, ruta, nombre_original, mime_type, tamano_bytes,
      tipo_recurso, recurso_id)
    VALUES (?, ?, ?, ?, ?, 'foto_ot', ?)
  `).bind(
    orden.usuario_id, ruta, `${tipoFoto}_${id}_${Date.now()}.${extension}`,
    mimeType, buffer.byteLength || 0, parseInt(id)
  ).run();

  const foto = await DB.prepare(
    'SELECT * FROM FotosTrabajo WHERE id = ?'
  ).bind(fotoResult.meta.last_row_id).first();

  return jsonResponse({ foto }, 201);
}
