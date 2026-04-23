// ============================================================
// BizFlow - Admin Técnicos [id] API
// GET: Get technician with stats
// PUT: Update technician
// DELETE: Soft delete technician
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
    console.error('Técnico [id] error:', error);
    return errorResponse('Error en técnico: ' + error.message, 500);
  }
}

async function handleGet(DB, id) {
  const tecnico = await DB.prepare(
    'SELECT * FROM Tecnicos WHERE id = ?'
  ).bind(id).first();

  if (!tecnico) {
    return errorResponse('Técnico no encontrado', 404);
  }

  // Stats: completed OTs, in-progress OTs, revenue
  const stats = await DB.prepare(`
    SELECT
      COUNT(*) as total_ordenes,
      SUM(CASE WHEN estado IN ('pendiente', 'asignada', 'en_proceso', 'pausada') THEN 1 ELSE 0 END) as ot_en_progreso,
      SUM(CASE WHEN estado IN ('completada', 'cerrada', 'aprobada') THEN 1 ELSE 0 END) as ot_completadas,
      SUM(CASE WHEN estado = 'cancelada' THEN 1 ELSE 0 END) as ot_canceladas,
      COALESCE(SUM(CASE WHEN estado IN ('completada', 'cerrada', 'aprobada') THEN total ELSE 0 END), 0) as facturado
    FROM OrdenesTrabajo
    WHERE tecnico_id = ?
  `).bind(id).first();

  // Current active orders
  const { results: ordenesActivas } = await DB.prepare(`
    SELECT id, numero, estado, titulo, fecha_creacion, total,
      c.nombre as cliente_nombre, v.placa
    FROM OrdenesTrabajo ot
    LEFT JOIN Clientes c ON ot.cliente_id = c.id
    LEFT JOIN Vehiculos v ON ot.vehiculo_id = v.id
    WHERE ot.tecnico_id = ? AND ot.estado IN ('pendiente', 'asignada', 'en_proceso', 'pausada')
    ORDER BY ot.prioridad DESC, ot.fecha_creacion DESC
  `).bind(id).all();

  return jsonResponse({
    tecnico,
    estadisticas: {
      total_ordenes: stats?.total_ordenes || 0,
      en_progreso: stats?.ot_en_progreso || 0,
      completadas: stats?.ot_completadas || 0,
      canceladas: stats?.ot_canceladas || 0,
      facturado: stats?.facturado || 0,
    },
    ordenes_activas: ordenesActivas || [],
  });
}

async function handlePut(request, DB, id) {
  const existing = await DB.prepare(
    'SELECT id FROM Tecnicos WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Técnico no encontrado', 404);
  }

  const data = await request.json();
  const fields = [];
  const values = [];

  const updatableFields = ['nombre', 'especialidad', 'telefono', 'email', 'codigo',
    'latitud', 'longitud', 'ubicacion_actual'];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      if (field === 'latitud' || field === 'longitud') {
        values.push(parseFloat(data[field]) || 0);
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
    UPDATE Tecnicos SET ${fields.join(', ')} WHERE id = ?
  `).bind(...values).run();

  const tecnico = await DB.prepare(
    'SELECT * FROM Tecnicos WHERE id = ?'
  ).bind(id).first();

  return jsonResponse({ tecnico });
}

async function handleDelete(DB, id) {
  const existing = await DB.prepare(
    'SELECT id, nombre FROM Tecnicos WHERE id = ? AND activo = 1'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Técnico no encontrado', 404);
  }

  // Check for active orders
  const activeOrders = await DB.prepare(
    'SELECT COUNT(*) as total FROM OrdenesTrabajo WHERE tecnico_id = ? AND estado NOT IN (\'cancelada\', \'cerrada\', \'completada\', \'aprobada\')'
  ).bind(id).first();

  if (activeOrders?.total > 0) {
    return errorResponse('No se puede eliminar el técnico porque tiene ' + activeOrders.total + ' orden(es) activa(s)');
  }

  await DB.prepare(`
    UPDATE Tecnicos SET activo = 0, actualizado_en = datetime('now') WHERE id = ?
  `).bind(id).run();

  // Unassign from any future orders
  await DB.prepare(`
    UPDATE OrdenesTrabajo SET tecnico_id = NULL WHERE tecnico_id = ? AND estado = 'pendiente'
  `).bind(id).run();

  return jsonResponse({ mensaje: `Técnico "${existing.nombre}" eliminado correctamente` });
}
