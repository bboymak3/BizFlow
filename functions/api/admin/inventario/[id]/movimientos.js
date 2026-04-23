// ============================================================
// BizFlow - Admin Inventario [id] Movimientos API
// GET: List inventory movements
// POST: Add inventory movement (updates stock)
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
      return await handleGet(request, DB, id);
    } else if (request.method === 'POST') {
      return await handlePost(request, DB, id);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Movimientos inventario error:', error);
    return errorResponse('Error en movimientos: ' + error.message, 500);
  }
}

async function handleGet(request, DB, id) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;

  // Verify item exists
  const item = await DB.prepare(
    'SELECT * FROM Inventario WHERE id = ?'
  ).bind(id).first();

  if (!item) {
    return errorResponse('Item no encontrado', 404);
  }

  const offset = (page - 1) * limit;
  const { results } = await DB.prepare(`
    SELECT mi.*
    FROM MovimientosInventario mi
    WHERE mi.inventario_id = ?
    ORDER BY mi.creado_en DESC
    LIMIT ? OFFSET ?
  `).bind(id, limit, offset).all();

  const totalCount = await DB.prepare(
    'SELECT COUNT(*) as total FROM MovimientosInventario WHERE inventario_id = ?'
  ).bind(id).first();

  return jsonResponse({
    movimientos: results || [],
    item: {
      id: item.id,
      nombre: item.nombre,
      codigo: item.codigo,
      cantidad_actual: item.cantidad,
      cantidad_minima: item.cantidad_minima,
    },
    paginacion: {
      page,
      limit,
      total: totalCount?.total || 0,
      total_pages: Math.ceil((totalCount?.total || 0) / limit),
    }
  });
}

async function handlePost(request, DB, id) {
  const item = await DB.prepare(
    'SELECT * FROM Inventario WHERE id = ? AND activo = 1'
  ).bind(id).first();

  if (!item) {
    return errorResponse('Item no encontrado o inactivo', 404);
  }

  const data = await request.json();
  const { tipo, cantidad, orden_id, concepto } = data;

  if (!tipo || !['entrada', 'salida', 'ajuste'].includes(tipo)) {
    return errorResponse('tipo inválido. Valores: entrada, salida, ajuste');
  }

  if (!cantidad || parseInt(cantidad) <= 0) {
    return errorResponse('cantidad debe ser un número positivo');
  }

  const qty = parseInt(cantidad);

  // Calculate new stock
  let nuevaCantidad = item.cantidad;
  if (tipo === 'entrada') {
    nuevaCantidad += qty;
  } else if (tipo === 'salida') {
    nuevaCantidad -= qty;
    if (nuevaCantidad < 0) {
      return errorResponse(`Stock insuficiente. Stock actual: ${item.cantidad}, solicitado: ${qty}`);
    }
  } else if (tipo === 'ajuste') {
    nuevaCantidad = qty; // ajuste sets the absolute quantity
  }

  // Create movement
  const result = await DB.prepare(`
    INSERT INTO MovimientosInventario (inventario_id, tipo, cantidad, orden_id, concepto)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    tipo,
    tipo === 'ajuste' ? qty : qty, // for ajuste, store the new target qty in concepto instead
    orden_id || null,
    concepto?.trim() || ''
  ).run();

  // Update stock
  await DB.prepare(`
    UPDATE Inventario SET cantidad = ?, actualizado_en = datetime('now') WHERE id = ?
  `).bind(nuevaCantidad, id).run();

  const movimiento = await DB.prepare(
    'SELECT * FROM MovimientosInventario WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({
    movimiento,
    stock_anterior: item.cantidad,
    stock_nuevo: nuevaCantidad,
    mensaje: `Stock actualizado: ${item.cantidad} → ${nuevaCantidad}`,
  }, 201);
}
