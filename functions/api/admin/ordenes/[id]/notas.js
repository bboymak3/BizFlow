// ============================================================
// BizFlow - Admin Ordenes [id] Notas API
// GET: List notes for order
// POST: Add note to order
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  try {
    if (request.method === 'GET') {
      return await handleGet(DB, id);
    } else if (request.method === 'POST') {
      return await handlePost(request, DB, id);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Notas error:', error);
    return errorResponse('Error en notas: ' + error.message, 500);
  }
}

async function handleGet(DB, id) {
  const orden = await DB.prepare(
    'SELECT id FROM OrdenesTrabajo WHERE id = ?'
  ).bind(id).first();

  if (!orden) {
    return errorResponse('Orden no encontrada', 404);
  }

  const { results } = await DB.prepare(`
    SELECT * FROM NotasTrabajo WHERE orden_id = ? ORDER BY creado_en ASC
  `).bind(id).all();

  return jsonResponse({
    notas: results || [],
    total: (results || []).length,
  });
}

async function handlePost(request, DB, id) {
  const orden = await DB.prepare(
    'SELECT id FROM OrdenesTrabajo WHERE id = ?'
  ).bind(id).first();

  if (!orden) {
    return errorResponse('Orden no encontrada', 404);
  }

  const data = await request.json();
  const { autor, autor_tipo, contenido } = data;

  if (!contenido || !contenido.trim()) {
    return errorResponse('contenido es requerido');
  }

  const tiposValidos = ['admin', 'tecnico', 'sistema', 'cliente'];
  const tipo = tiposValidos.includes(autor_tipo) ? autor_tipo : 'admin';

  const result = await DB.prepare(`
    INSERT INTO NotasTrabajo (orden_id, autor, autor_tipo, contenido)
    VALUES (?, ?, ?, ?)
  `).bind(id, autor?.trim() || 'Admin', tipo, contenido.trim()).run();

  const nota = await DB.prepare(
    'SELECT * FROM NotasTrabajo WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ nota }, 201);
}
