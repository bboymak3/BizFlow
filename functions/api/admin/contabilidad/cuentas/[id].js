// ============================================================
// BizFlow - Admin Contabilidad Cuentas [id] API
// PUT: Update account
// DELETE: Soft delete (deactivate) account
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../../lib/db-helpers.js';

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
    console.error('Cuenta [id] error:', error);
    return errorResponse('Error en cuenta: ' + error.message, 500);
  }
}

async function handlePut(request, DB, id) {
  const existing = await DB.prepare(
    'SELECT id FROM CuentasContables WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Cuenta no encontrada', 404);
  }

  const data = await request.json();
  const fields = [];
  const values = [];

  const updatableFields = ['codigo', 'nombre', 'tipo', 'descripcion', 'activa'];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      if (field === 'activa') {
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
    UPDATE CuentasContables SET ${fields.join(', ')} WHERE id = ?
  `).bind(...values).run();

  const cuenta = await DB.prepare(
    'SELECT * FROM CuentasContables WHERE id = ?'
  ).bind(id).first();

  return jsonResponse({ cuenta });
}

async function handleDelete(DB, id) {
  const existing = await DB.prepare(
    'SELECT id, nombre, codigo FROM CuentasContables WHERE id = ? AND activa = 1'
  ).bind(id).first();

  if (!existing) {
    return errorResponse('Cuenta no encontrada', 404);
  }

  // Check for movements
  const tieneMovimientos = await DB.prepare(`
    SELECT COUNT(*) as total FROM MovimientosContables WHERE cuenta_id = ?
  `).bind(id).first();

  if (tieneMovimientos?.total > 0) {
    return errorResponse('No se puede eliminar una cuenta con movimientos. Desactívela en su lugar.');
  }

  await DB.prepare(
    'DELETE FROM CuentasContables WHERE id = ?'
  ).bind(id).run();

  return jsonResponse({ mensaje: `Cuenta "${existing.codigo} - ${existing.nombre}" eliminada correctamente` });
}
