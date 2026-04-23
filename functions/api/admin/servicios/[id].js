// ============================================================
// BizFlow - Admin Servicios [id] API
// PUT: Update service
// DELETE: Delete service
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  try {
    if (request.method === 'PUT') {
      return await handlePut(request, DB, id);
    } else if (request.method === 'DELETE') {
      return await handleDelete(DB, id);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Servicio [id] error:', error);
    return errorResponse('Error en servicio: ' + error.message, 500);
  }
}

async function handlePut(request, DB, id) {
  const existing = await DB.prepare(
    'SELECT id FROM ServiciosCatalogo WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Servicio no encontrado', 404);
  }

  const data = await request.json();
  const fields = [];
  const values = [];

  const updatableFields = ['nombre', 'descripcion', 'precio', 'duracion_minutos', 'categoria', 'activo'];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      if (field === 'precio') {
        values.push(parseFloat(data[field]) || 0);
      } else if (field === 'duracion_minutos') {
        values.push(parseInt(data[field]) || 60);
      } else if (field === 'activo') {
        values.push(data[field] ? 1 : 0);
      } else {
        values.push(data[field]?.trim?.() || data[field] || '');
      }
    }
  }

  if (fields.length === 0) {
    return errorResponse('No se proporcionaron campos para actualizar');
  }

  values.push(id);

  await DB.prepare(`
    UPDATE ServiciosCatalogo SET ${fields.join(', ')} WHERE id = ?
  `).bind(...values).run();

  const servicio = await DB.prepare(
    'SELECT * FROM ServiciosCatalogo WHERE id = ?'
  ).bind(id).first();

  return jsonResponse({ servicio });
}

async function handleDelete(DB, id) {
  const existing = await DB.prepare(
    'SELECT id, nombre FROM ServiciosCatalogo WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Servicio no encontrado', 404);
  }

  await DB.prepare(
    'DELETE FROM ServiciosCatalogo WHERE id = ?'
  ).bind(id).run();

  return jsonResponse({ mensaje: `Servicio "${existing.nombre}" eliminado correctamente` });
}
