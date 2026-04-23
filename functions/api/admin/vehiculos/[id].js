// ============================================================
// BizFlow - Admin Vehiculos [id] API
// GET: Get vehicle by ID
// PUT: Update vehicle
// DELETE: Soft delete vehicle
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
    console.error('Vehiculo [id] error:', error);
    return errorResponse('Error en vehículo: ' + error.message, 500);
  }
}

async function handleGet(DB, id) {
  const vehiculo = await DB.prepare(`
    SELECT
      v.*,
      c.id as cliente_id, c.nombre as cliente_nombre, c.apellido as cliente_apellido,
      c.empresa as cliente_empresa, c.telefono as cliente_telefono
    FROM Vehiculos v
    LEFT JOIN Clientes c ON v.cliente_id = c.id
    WHERE v.id = ?
  `).bind(id).first();

  if (!vehiculo) {
    return errorResponse('Vehículo no encontrado', 404);
  }

  // Get OT count for this vehicle
  const otCount = await DB.prepare(
    'SELECT COUNT(*) as total FROM OrdenesTrabajo WHERE vehiculo_id = ?'
  ).bind(id).first();

  return jsonResponse({
    vehiculo,
    total_ordenes: otCount?.total || 0,
  });
}

async function handlePut(request, DB, id) {
  const existing = await DB.prepare(
    'SELECT id FROM Vehiculos WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Vehículo no encontrado', 404);
  }

  const data = await request.json();
  const fields = [];
  const values = [];

  const updatableFields = [
    'placa', 'marca', 'modelo', 'anio', 'color', 'vin', 'kilometraje', 'notas'
  ];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      if (field === 'placa') {
        values.push(data[field].trim().toUpperCase());
      } else if (field === 'anio' || field === 'kilometraje') {
        values.push(parseInt(data[field]) || 0);
      } else {
        values.push(data[field]?.trim?.() || data[field] || '');
      }
    }
  }

  if (fields.length === 0) {
    return errorResponse('No se proporcionaron campos para actualizar');
  }

  fields.push("actualizado_en = datetime('now')");
  values.push(id);

  await DB.prepare(`
    UPDATE Vehiculos SET ${fields.join(', ')} WHERE id = ?
  `).bind(...values).run();

  const vehiculo = await DB.prepare(
    'SELECT * FROM Vehiculos WHERE id = ?'
  ).bind(id).first();

  return jsonResponse({ vehiculo });
}

async function handleDelete(DB, id) {
  const existing = await DB.prepare(
    'SELECT id, placa FROM Vehiculos WHERE id = ? AND activo = 1'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Vehículo no encontrado', 404);
  }

  await DB.prepare(`
    UPDATE Vehiculos SET activo = 0, actualizado_en = datetime('now') WHERE id = ?
  `).bind(id).run();

  return jsonResponse({ mensaje: `Vehículo "${existing.placa}" eliminado correctamente` });
}
