// ============================================================
// BizFlow - Admin Servicios API
// GET: List services from catalog
// POST: Create service
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const { DB } = env;

  try {
    if (request.method === 'GET') {
      return await handleGet(request, DB);
    } else if (request.method === 'POST') {
      return await handlePost(request, DB);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Servicios error:', error);
    return errorResponse('Error en servicios: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  let usuarioId = url.searchParams.get('usuario_id');
  const categoria = url.searchParams.get('categoria');

  if (!usuarioId) {
    usuarioId = '1';
  }

  let whereClause = 'WHERE usuario_id = ? AND activo = 1';
  const params = [usuarioId];

  if (categoria) {
    whereClause += ' AND categoria = ?';
    params.push(categoria);
  }

  const { results } = await DB.prepare(`
    SELECT * FROM ServiciosCatalogo
    ${whereClause}
    ORDER BY nombre ASC
  `).bind(...params).all();

  return jsonResponse({
    servicios: results || [],
    total: (results || []).length,
  });
}

async function handlePost(request, DB) {
  const data = await request.json();

  let { usuario_id, nombre, descripcion, precio, duracion_minutos, categoria } = data;

  if (!usuario_id) usuario_id = 1;
  if (!nombre || !nombre.trim()) return errorResponse('nombre es requerido');

  const result = await DB.prepare(`
    INSERT INTO ServiciosCatalogo (usuario_id, nombre, descripcion, precio, duracion_minutos, categoria)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    usuario_id,
    nombre.trim(),
    descripcion?.trim() || '',
    parseFloat(precio) || 0,
    parseInt(duracion_minutos) || 60,
    categoria?.trim() || 'general'
  ).run();

  const servicio = await DB.prepare(
    'SELECT * FROM ServiciosCatalogo WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ servicio }, 201);
}
