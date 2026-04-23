// ============================================================
// BizFlow - Admin Inventario [id] API
// PUT: Update inventory item
// DELETE: Delete inventory item
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
    console.error('Inventario [id] error:', error);
    return errorResponse('Error en inventario: ' + error.message, 500);
  }
}

async function handlePut(request, DB, id) {
  const existing = await DB.prepare(
    'SELECT id FROM Inventario WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Item no encontrado', 404);
  }

  const data = await request.json();
  const fields = [];
  const values = [];

  const updatableFields = ['codigo', 'nombre', 'descripcion', 'categoria',
    'cantidad', 'cantidad_minima', 'precio_compra', 'precio_venta',
    'proveedor', 'ubicacion', 'activo'];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      if (field === 'cantidad' || field === 'cantidad_minima') {
        values.push(parseInt(data[field]) || 0);
      } else if (field === 'precio_compra' || field === 'precio_venta') {
        values.push(parseFloat(data[field]) || 0);
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

  fields.push("actualizado_en = datetime('now')");
  values.push(id);

  await DB.prepare(`
    UPDATE Inventario SET ${fields.join(', ')} WHERE id = ?
  `).bind(...values).run();

  const item = await DB.prepare(
    'SELECT * FROM Inventario WHERE id = ?'
  ).bind(id).first();

  return jsonResponse({ item });
}

async function handleDelete(DB, id) {
  const existing = await DB.prepare(
    'SELECT id, nombre FROM Inventario WHERE id = ? AND activo = 1'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Item no encontrado', 404);
  }

  await DB.prepare(
    'DELETE FROM Inventario WHERE id = ?'
  ).bind(id).run();

  return jsonResponse({ mensaje: `Item "${existing.nombre}" eliminado correctamente` });
}
