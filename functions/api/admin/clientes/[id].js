// ============================================================
// BizFlow - Admin Clientes [id] API
// GET: Get client by ID with vehicles
// PUT: Update client
// DELETE: Soft delete client
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  try {
    if (request.method === 'GET') {
      return await handleGet(DB, id);
    } else if (request.method === 'PUT') {
      return await handlePut(request, DB, id);
    } else if (request.method === 'DELETE') {
      return await handleDelete(DB, id);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Cliente [id] error:', error);
    return errorResponse('Error en cliente: ' + error.message, 500);
  }
}

async function handleGet(DB, id) {
  const cliente = await DB.prepare(
    'SELECT * FROM Clientes WHERE id = ?'
  ).bind(id).first();

  if (!cliente) {
    return errorResponse('Cliente no encontrado', 404);
  }

  // Get vehicles for this client
  const { results: vehiculos } = await DB.prepare(`
    SELECT * FROM Vehiculos
    WHERE cliente_id = ? AND activo = 1
    ORDER BY creado_en DESC
  `).bind(id).all();

  // Get OT count
  const otCount = await DB.prepare(
    'SELECT COUNT(*) as total FROM OrdenesTrabajo WHERE cliente_id = ?'
  ).bind(id).first();

  return jsonResponse({
    cliente,
    vehiculos: vehiculos || [],
    total_ordenes: otCount?.total || 0,
  });
}

async function handlePut(request, DB, id) {
  const existing = await DB.prepare(
    'SELECT id FROM Clientes WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Cliente no encontrado', 404);
  }

  const data = await request.json();
  const fields = [];
  const values = [];

  const updatableFields = [
    'empresa', 'nombre', 'apellido', 'cedula_rif', 'email',
    'telefono', 'telefono2', 'direccion', 'ciudad', 'estado',
    'codigo_postal', 'notas', 'origen', 'landing_page_id'
  ];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(typeof data[field] === 'string' ? data[field].trim() : data[field]);
    }
  }

  if (fields.length === 0) {
    return errorResponse('No se proporcionaron campos para actualizar');
  }

  fields.push("actualizado_en = datetime('now')");
  values.push(id);

  await DB.prepare(`
    UPDATE Clientes SET ${fields.join(', ')} WHERE id = ?
  `).bind(...values).run();

  const cliente = await DB.prepare(
    'SELECT * FROM Clientes WHERE id = ?'
  ).bind(id).first();

  return jsonResponse({ cliente });
}

async function handleDelete(DB, id) {
  const existing = await DB.prepare(
    'SELECT id, nombre FROM Clientes WHERE id = ? AND activo = 1'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Cliente no encontrado', 404);
  }

  await DB.prepare(`
    UPDATE Clientes SET activo = 0, actualizado_en = datetime('now') WHERE id = ?
  `).bind(id).run();

  return jsonResponse({ mensaje: `Cliente "${existing.nombre}" eliminado correctamente` });
}
