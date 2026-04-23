// ============================================================
// BizFlow - Admin Pagos API
// GET: List payments with filters
// POST: Create payment
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO } from '../../lib/db-helpers.js';

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
    console.error('Pagos error:', error);
    return errorResponse('Error en pagos: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  let usuarioId = url.searchParams.get('usuario_id');
  const fechaDesde = url.searchParams.get('fecha_desde');
  const fechaHasta = url.searchParams.get('fecha_hasta');
  const metodo = url.searchParams.get('metodo');
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;

  if (!usuarioId) {
    usuarioId = '1';
  }

  let whereClause = `WHERE ot.usuario_id = ?`;
  const params = [usuarioId];

  if (fechaDesde) {
    whereClause += ' AND p.fecha_pago >= ?';
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    whereClause += ' AND p.fecha_pago <= ?';
    params.push(fechaHasta);
  }

  if (metodo) {
    whereClause += ' AND p.metodo_pago = ?';
    params.push(metodo);
  }

  // Count
  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM Pagos p JOIN OrdenesTrabajo ot ON p.orden_id = ot.id ${whereClause}`
  ).bind(...params).first();

  // Total sum
  const sumResult = await DB.prepare(
    `SELECT COALESCE(SUM(p.monto), 0) as total_pagos FROM Pagos p JOIN OrdenesTrabajo ot ON p.orden_id = ot.id ${whereClause}`
  ).bind(...params).first();

  // Results
  const offset = (page - 1) * limit;
  const { results } = await DB.prepare(`
    SELECT
      p.*,
      ot.numero, ot.estado as orden_estado, ot.total as orden_total,
      c.nombre as cliente_nombre, c.empresa as cliente_empresa
    FROM Pagos p
    JOIN OrdenesTrabajo ot ON p.orden_id = ot.id
    LEFT JOIN Clientes c ON ot.cliente_id = c.id
    ${whereClause}
    ORDER BY p.fecha_pago DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return jsonResponse({
    pagos: results || [],
    total_suma: sumResult?.total_pagos || 0,
    paginacion: {
      page,
      limit,
      total: countResult?.total || 0,
      total_pages: Math.ceil((countResult?.total || 0) / limit),
    }
  });
}

async function handlePost(request, DB) {
  const data = await request.json();
  const { orden_id, monto, metodo, referencia, notas } = data;

  if (!orden_id) return errorResponse('orden_id es requerido');
  if (!monto || parseFloat(monto) <= 0) return errorResponse('monto debe ser positivo');

  // Verify order exists
  const orden = await DB.prepare(
    'SELECT id, total, estado FROM OrdenesTrabajo WHERE id = ?'
  ).bind(orden_id).first();

  if (!orden) {
    return errorResponse('Orden no encontrada', 404);
  }

  if (orden.estado === 'cancelada' || orden.estado === 'cerrada') {
    return errorResponse('No se pueden agregar pagos a una orden cancelada o cerrada');
  }

  const metodosValidos = ['efectivo', 'transferencia', 'tarjeta', 'punto_venta', 'mixto'];
  const metodoPago = metodosValidos.includes(metodo) ? metodo : 'efectivo';

  const now = hoyISO();

  const result = await DB.prepare(`
    INSERT INTO Pagos (orden_id, monto, metodo_pago, referencia, fecha_pago, observaciones)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    orden_id,
    parseFloat(monto),
    metodoPago,
    referencia?.trim() || '',
    now,
    notas?.trim() || ''
  ).run();

  // Add note to order
  await DB.prepare(`
    INSERT INTO NotasTrabajo (orden_id, autor, autor_tipo, contenido)
    VALUES (?, 'Sistema', 'sistema', ?)
  `).bind(orden_id, `Pago registrado: $${parseFloat(monto).toFixed(2)} via ${metodoPago}${referencia ? ' (Ref: ' + referencia + ')' : ''}`).run();

  // Update payment method on order
  await DB.prepare(
    'UPDATE OrdenesTrabajo SET metodo_pago = ?, actualizado_en = ? WHERE id = ? AND (metodo_pago = "" OR metodo_pago IS NULL)'
  ).bind(metodoPago, now, orden_id).run();

  const pago = await DB.prepare(
    'SELECT * FROM Pagos WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  // Get total paid for this order
  const totalPagado = await DB.prepare(
    'SELECT COALESCE(SUM(monto), 0) as total FROM Pagos WHERE orden_id = ?'
  ).bind(orden_id).first();

  return jsonResponse({
    pago,
    total_pagado_orden: totalPagado?.total || 0,
    saldo_pendiente: Math.max(0, (orden.total || 0) - (totalPagado?.total || 0)),
  }, 201);
}
