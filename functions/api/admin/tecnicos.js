// ============================================================
// BizFlow - Admin Técnicos API
// GET: List technicians
// POST: Create technician
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
    console.error('Técnicos error:', error);
    return errorResponse('Error en técnicos: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  const usuarioId = url.searchParams.get('usuario_id');

  if (!usuarioId) {
    return errorResponse('usuario_id es requerido');
  }

  const { results } = await DB.prepare(`
    SELECT
      t.*,
      (SELECT COUNT(*) FROM OrdenesTrabajo ot WHERE ot.tecnico_id = t.id AND ot.estado NOT IN ('cancelada', 'cerrada')) as ot_activas,
      (SELECT COUNT(*) FROM OrdenesTrabajo ot WHERE ot.tecnico_id = t.id AND ot.estado IN ('completada', 'cerrada', 'aprobada')) as ot_completadas
    FROM Tecnicos t
    WHERE t.usuario_id = ? AND t.activo = 1
    ORDER BY t.nombre ASC
  `).bind(usuarioId).all();

  return jsonResponse({
    tecnicos: results || [],
    total: (results || []).length,
  });
}

async function handlePost(request, DB) {
  const data = await request.json();

  const { usuario_id, nombre, especialidad, telefono, email, codigo } = data;

  if (!usuario_id) return errorResponse('usuario_id es requerido');
  if (!nombre || !nombre.trim()) return errorResponse('nombre es requerido');
  if (!codigo || !codigo.trim()) return errorResponse('codigo es requerido');

  // Check for duplicate code
  const existing = await DB.prepare(
    'SELECT id FROM Tecnicos WHERE codigo = ? AND usuario_id = ?'
  ).bind(codigo.trim(), usuario_id).first();

  if (existing) {
    return errorResponse('Ya existe un técnico con ese código');
  }

  const result = await DB.prepare(`
    INSERT INTO Tecnicos (usuario_id, codigo, nombre, especialidad, telefono, email)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    usuario_id,
    codigo.trim(),
    nombre.trim(),
    especialidad?.trim() || 'general',
    telefono?.trim() || '',
    email?.trim() || ''
  ).run();

  const tecnico = await DB.prepare(
    'SELECT * FROM Tecnicos WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ tecnico }, 201);
}
