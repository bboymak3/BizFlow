// ============================================================
// BizFlow - Admin Contabilidad Asientos API
// GET: List journal entries with movements
// POST: Create journal entry with movements (validates debits = credits)
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO } from '../../../lib/db-helpers.js';

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
    console.error('Asientos contables error:', error);
    return errorResponse('Error en asientos: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  let usuarioId = url.searchParams.get('usuario_id');
  const fechaDesde = url.searchParams.get('fecha_desde');
  const fechaHasta = url.searchParams.get('fecha_hasta');
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;

  if (!usuarioId) {
    usuarioId = '1';
  }

  let whereClause = 'WHERE usuario_id = ?';
  const params = [usuarioId];

  if (fechaDesde) {
    whereClause += ' AND fecha >= ?';
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    whereClause += ' AND fecha <= ?';
    params.push(fechaHasta);
  }

  // Count
  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM AsientosContables ${whereClause}`
  ).bind(...params).first();

  // Results
  const offset = (page - 1) * limit;
  const { results } = await DB.prepare(`
    SELECT * FROM AsientosContables
    ${whereClause}
    ORDER BY fecha DESC, creado_en DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  // Get movements for each entry
  const asientosConMovimientos = [];
  for (const asiento of (results || [])) {
    const { results: movimientos } = await DB.prepare(`
      SELECT m.*, c.codigo as cuenta_codigo, c.nombre as cuenta_nombre, c.tipo as cuenta_tipo
      FROM MovimientosContables m
      LEFT JOIN CuentasContables c ON m.cuenta_id = c.id
      WHERE m.asiento_id = ?
      ORDER BY c.codigo ASC
    `).bind(asiento.id).all();

    asientosConMovimientos.push({
      ...asiento,
      movimientos: movimientos || [],
    });
  }

  return jsonResponse({
    asientos: asientosConMovimientos,
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

  let { usuario_id, numero, fecha, concepto, tipo_fuente, fuente_id, movimientos } = data;

  if (!usuario_id) usuario_id = 1;
  if (!concepto || !concepto.trim()) return errorResponse('concepto es requerido');

  if (!movimientos || !Array.isArray(movimientos) || movimientos.length < 2) {
    return errorResponse('Se requieren al menos 2 movimientos (debe y haber)');
  }

  // Validate each movement
  let totalDebe = 0;
  let totalHaber = 0;

  for (const mov of movimientos) {
    if (!mov.cuenta_id) {
      return errorResponse('cuenta_id es requerido en cada movimiento');
    }

    const debe = parseFloat(mov.debe) || 0;
    const haber = parseFloat(mov.haber) || 0;

    if (debe === 0 && haber === 0) {
      return errorResponse('Cada movimiento debe tener debe o haber mayor a 0');
    }

    if (debe > 0 && haber > 0) {
      return errorResponse('Cada movimiento solo puede tener debe O haber, no ambos');
    }

    totalDebe += debe;
    totalHaber += haber;

    // Verify account exists
    const cuenta = await DB.prepare(
      'SELECT id FROM CuentasContables WHERE id = ? AND usuario_id = ? AND activa = 1'
    ).bind(mov.cuenta_id, usuario_id).first();

    if (!cuenta) {
      return errorResponse(`Cuenta contable ${mov.cuenta_id} no encontrada`);
    }
  }

  // Validate balance (debits must equal credits)
  const diff = Math.abs(totalDebe - totalHaber);
  if (diff > 0.01) {
    return errorResponse(`El asiento no está balanceado. Debe: $${totalDebe.toFixed(2)}, Haber: $${totalHaber.toFixed(2)}, Diferencia: $${diff.toFixed(2)}`);
  }

  const now = hoyISO();

  // Get next entry number if not provided
  let entryNumber = numero?.trim();
  if (!entryNumber) {
    const lastEntry = await DB.prepare(
      'SELECT numero FROM AsientosContables WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT 1'
    ).bind(usuario_id).first();

    const lastNum = parseInt(lastEntry?.numero) || 0;
    entryNumber = String(lastNum + 1).padStart(6, '0');
  }

  const tiposFuenteValidos = ['manual', 'ot', 'gasto', 'pago', 'factura'];
  const tipoFuente = tiposFuenteValidos.includes(tipo_fuente) ? tipo_fuente : 'manual';

  // Create journal entry
  const result = await DB.prepare(`
    INSERT INTO AsientosContables (usuario_id, numero, fecha, concepto, tipo_fuente, fuente_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    usuario_id,
    entryNumber,
    fecha || now,
    concepto.trim(),
    tipoFuente,
    fuente_id || null
  ).run();

  const asientoId = result.meta.last_row_id;

  // Create movements
  for (const mov of movimientos) {
    await DB.prepare(`
      INSERT INTO MovimientosContables (asiento_id, cuenta_id, debe, haber, descripcion)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      asientoId,
      mov.cuenta_id,
      parseFloat(mov.debe) || 0,
      parseFloat(mov.haber) || 0,
      mov.descripcion?.trim() || ''
    ).run();
  }

  // Get the created entry with movements
  const asiento = await DB.prepare(
    'SELECT * FROM AsientosContables WHERE id = ?'
  ).bind(asientoId).first();

  const { results: movs } = await DB.prepare(`
    SELECT m.*, c.codigo as cuenta_codigo, c.nombre as cuenta_nombre, c.tipo as cuenta_tipo
    FROM MovimientosContables m
    LEFT JOIN CuentasContables c ON m.cuenta_id = c.id
    WHERE m.asiento_id = ?
  `).bind(asientoId).all();

  return jsonResponse({
    asiento: {
      ...asiento,
      movimientos: movs || [],
    },
    total_debe: totalDebe,
    total_haber: totalHaber,
    mensaje: 'Asiento contable creado exitosamente (balanceado)',
  }, 201);
}
