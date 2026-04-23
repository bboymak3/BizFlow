// ============================================================
// BizFlow - Admin Ordenes [id] Costos API
// GET: List additional costs for order
// POST: Add cost to order
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
    console.error('Costos error:', error);
    return errorResponse('Error en costos: ' + error.message, 500);
  }
}

async function handleGet(DB, id) {
  // Verify order exists
  const orden = await DB.prepare(
    'SELECT id FROM OrdenesTrabajo WHERE id = ?'
  ).bind(id).first();

  if (!orden) {
    return errorResponse('Orden no encontrada', 404);
  }

  const { results } = await DB.prepare(`
    SELECT * FROM CostosAdicionales WHERE orden_id = ? ORDER BY creado_en ASC
  `).bind(id).all();

  const totalCostos = (results || []).reduce((sum, c) => sum + (c.total || 0), 0);

  return jsonResponse({
    costos: results || [],
    total: totalCostos,
  });
}

async function handlePost(request, DB, id) {
  // Verify order exists
  const orden = await DB.prepare(
    'SELECT id, estado FROM OrdenesTrabajo WHERE id = ?'
  ).bind(id).first();

  if (!orden) {
    return errorResponse('Orden no encontrada', 404);
  }

  if (orden.estado === 'cerrada' || orden.estado === 'cancelada') {
    return errorResponse('No se pueden agregar costos a una orden cerrada o cancelada');
  }

  const data = await request.json();
  const { concepto, cantidad, precio_unitario, tipo } = data;

  if (!concepto || !concepto.trim()) {
    return errorResponse('concepto es requerido');
  }

  const qty = parseInt(cantidad) || 1;
  const price = parseFloat(precio_unitario) || 0;
  const total = qty * price;

  const tiposValidos = ['repuesto', 'servicio', 'mano_obra', 'otro'];
  const tipoCosto = tiposValidos.includes(tipo) ? tipo : 'otro';

  const result = await DB.prepare(`
    INSERT INTO CostosAdicionales (orden_id, concepto, cantidad, precio_unitario, total, tipo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, concepto.trim(), qty, price, total, tipoCosto).run();

  // Update order total (subtotal + costs - tax calculation)
  const costosResult = await DB.prepare(
    'SELECT COALESCE(SUM(total), 0) as total FROM CostosAdicionales WHERE orden_id = ?'
  ).bind(id).first();

  await DB.prepare(`
    UPDATE OrdenesTrabajo SET total = ? WHERE id = ?
  `).bind(costosResult.total, id).run();

  const costo = await DB.prepare(
    'SELECT * FROM CostosAdicionales WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ costo }, 201);
}
