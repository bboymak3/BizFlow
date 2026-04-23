// ============================================================
// BizFlow - Admin Reportes API
// GET: Reports data (income, OTs, expenses, inventory)
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const { DB } = env;

  if (request.method !== 'GET') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const url = new URL(request.url);
    const usuarioId = url.searchParams.get('usuario_id');
    const tipo = url.searchParams.get('tipo') || 'ingresos';
    const fechaDesde = url.searchParams.get('fecha_desde');
    const fechaHasta = url.searchParams.get('fecha_hasta');

    if (!usuarioId) {
      return errorResponse('usuario_id es requerido');
    }

    // Base date filters
    let dateFilter = '';
    const params = [usuarioId];

    if (fechaDesde) {
      dateFilter += ' AND fecha_creacion >= ?';
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      dateFilter += ' AND fecha_creacion <= ?';
      params.push(fechaHasta);
    }

    switch (tipo) {
      case 'ingresos':
        return await reporteIngresos(DB, params, dateFilter);
      case 'ots':
        return await reporteOTs(DB, params, dateFilter);
      case 'gastos':
        return await reporteGastos(DB, params, fechaDesde, fechaHasta);
      case 'inventario':
        return await reporteInventario(DB, usuarioId);
      default:
        return errorResponse(`Tipo de reporte inválido: ${tipo}. Use: ingresos, ots, gastos, inventario`);
    }
  } catch (error) {
    console.error('Reportes error:', error);
    return errorResponse('Error generando reporte: ' + error.message, 500);
  }
}

async function reporteIngresos(DB, params, dateFilter) {
  const [diario, metodos, porTecnico, resumen] = await Promise.all([
    // Daily revenue
    DB.prepare(`
      SELECT
        DATE(fecha_creacion) as fecha,
        COALESCE(SUM(CASE WHEN estado IN ('completada', 'aprobada', 'cerrada') THEN total ELSE 0 END), 0) as ingresos,
        COUNT(*) as total_ot,
        SUM(CASE WHEN estado IN ('completada', 'aprobada', 'cerrada') THEN 1 ELSE 0 END) as ot_cobradas
      FROM OrdenesTrabajo
      WHERE usuario_id = ? ${dateFilter}
      GROUP BY DATE(fecha_creacion)
      ORDER BY fecha ASC
    `).bind(...params).all(),

    // Revenue by payment method
    DB.prepare(`
      SELECT
        COALESCE(metodo_pago, 'pendiente') as metodo,
        COUNT(*) as cantidad,
        COALESCE(SUM(total), 0) as total
      FROM OrdenesTrabajo
      WHERE usuario_id = ? AND estado IN ('completada', 'aprobada', 'cerrada') ${dateFilter}
      GROUP BY metodo_pago
      ORDER BY total DESC
    `).bind(...params).all(),

    // Revenue by technician
    DB.prepare(`
      SELECT
        t.nombre as tecnico,
        COUNT(ot.id) as total_ot,
        SUM(CASE WHEN ot.estado IN ('completada', 'cerrada', 'aprobada') THEN 1 ELSE 0 END) as ot_completadas,
        COALESCE(SUM(CASE WHEN ot.estado IN ('completada', 'cerrada', 'aprobada') THEN ot.total ELSE 0 END), 0) as facturado
      FROM OrdenesTrabajo ot
      LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
      WHERE ot.usuario_id = ? ${dateFilter}
      GROUP BY t.nombre
      ORDER BY facturado DESC
    `).bind(...params).all(),

    // Summary
    DB.prepare(`
      SELECT
        COUNT(*) as total_ot,
        COALESCE(SUM(CASE WHEN estado IN ('completada', 'aprobada', 'cerrada') THEN total ELSE 0 END), 0) as total_ingresos,
        COALESCE(AVG(CASE WHEN estado IN ('completada', 'aprobada', 'cerrada') THEN total ELSE 0 END), 0) as ticket_promedio
      FROM OrdenesTrabajo
      WHERE usuario_id = ? ${dateFilter}
    `).bind(...params).first(),
  ]);

  // Payments received
  const pagosResult = await DB.prepare(`
    SELECT COALESCE(SUM(monto), 0) as total_cobrado
    FROM Pagos p
    JOIN OrdenesTrabajo ot ON p.orden_id = ot.id
    WHERE ot.usuario_id = ?
  `).bind(params[0]).first();

  return jsonResponse({
    tipo: 'ingresos',
    resumen: {
      total_ordenes: resumen?.total_ot || 0,
      total_ingresos: resumen?.total_ingresos || 0,
      ticket_promedio: resumen?.ticket_promedio || 0,
      total_cobrado: pagosResult?.total_cobrado || 0,
    },
    ingresos_diarios: diario.results || [],
    por_metodo_pago: metodos.results || [],
    por_tecnico: porTecnico.results || [],
  });
}

async function reporteOTs(DB, params, dateFilter) {
  const [porEstado, porPrioridad, porTipo, tendencia] = await Promise.all([
    // By status
    DB.prepare(`
      SELECT estado, COUNT(*) as cantidad
      FROM OrdenesTrabajo
      WHERE usuario_id = ? ${dateFilter}
      GROUP BY estado
      ORDER BY cantidad DESC
    `).bind(...params).all(),

    // By priority
    DB.prepare(`
      SELECT prioridad, COUNT(*) as cantidad
      FROM OrdenesTrabajo
      WHERE usuario_id = ? ${dateFilter}
      GROUP BY prioridad
      ORDER BY cantidad DESC
    `).bind(...params).all(),

    // By type
    DB.prepare(`
      SELECT tipo, COUNT(*) as cantidad,
        COALESCE(AVG(total), 0) as promedio
      FROM OrdenesTrabajo
      WHERE usuario_id = ? ${dateFilter}
      GROUP BY tipo
      ORDER BY cantidad DESC
    `).bind(...params).all(),

    // Monthly trend
    DB.prepare(`
      SELECT
        strftime('%Y-%m', fecha_creacion) as mes,
        COUNT(*) as total,
        SUM(CASE WHEN estado IN ('completada', 'cerrada') THEN 1 ELSE 0 END) as completadas,
        SUM(CASE WHEN estado = 'cancelada' THEN 1 ELSE 0 END) as canceladas
      FROM OrdenesTrabajo
      WHERE usuario_id = ? ${dateFilter}
      GROUP BY strftime('%Y-%m', fecha_creacion)
      ORDER BY mes ASC
    `).bind(...params).all(),
  ]);

  return jsonResponse({
    tipo: 'ots',
    por_estado: porEstado.results || [],
    por_prioridad: porPrioridad.results || [],
    por_tipo: porTipo.results || [],
    tendencia_mensual: tendencia.results || [],
  });
}

async function reporteGastos(DB, usuarioId, fechaDesde, fechaHasta) {
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

  const [porCategoria, tendencia, resumen] = await Promise.all([
    // By category
    DB.prepare(`
      SELECT categoria, COUNT(*) as cantidad, SUM(monto) as total, AVG(monto) as promedio
      FROM GastosNegocio
      ${whereClause}
      GROUP BY categoria
      ORDER BY total DESC
    `).bind(...params).all(),

    // Monthly trend
    DB.prepare(`
      SELECT
        strftime('%Y-%m', fecha) as mes,
        COUNT(*) as total_gastos,
        SUM(monto) as monto_total
      FROM GastosNegocio
      ${whereClause}
      GROUP BY strftime('%Y-%m', fecha)
      ORDER BY mes ASC
    `).bind(...params).all(),

    // Summary
    DB.prepare(`
      SELECT COUNT(*) as total_gastos, SUM(monto) as monto_total, AVG(monto) as promedio
      FROM GastosNegocio
      ${whereClause}
    `).bind(...params).first(),
  ]);

  // Revenue vs expenses comparison
  const ingresosResult = await DB.prepare(`
    SELECT COALESCE(SUM(total), 0) as total
    FROM OrdenesTrabajo
    WHERE usuario_id = ? AND estado IN ('completada', 'aprobada', 'cerrada')
  `).bind(usuarioId).first();

  return jsonResponse({
    tipo: 'gastos',
    resumen: {
      total_gastos: resumen?.total_gastos || 0,
      monto_total: resumen?.monto_total || 0,
      promedio: resumen?.promedio || 0,
      total_ingresos: ingresosResult?.total || 0,
      balance: (ingresosResult?.total || 0) - (resumen?.monto_total || 0),
    },
    por_categoria: porCategoria.results || [],
    tendencia_mensual: tendencia.results || [],
  });
}

async function reporteInventario(DB, usuarioId) {
  const [resumen, porCategoria, stockBajo, ultimosMovimientos] = await Promise.all([
    // Summary
    DB.prepare(`
      SELECT
        COUNT(*) as total_items,
        SUM(cantidad) as total_unidades,
        SUM(cantidad * precio_compra) as valor_inventario_compra,
        SUM(cantidad * precio_venta) as valor_inventario_venta
      FROM Inventario
      WHERE usuario_id = ? AND activo = 1
    `).bind(usuarioId).first(),

    // By category
    DB.prepare(`
      SELECT categoria, COUNT(*) as items, SUM(cantidad) as unidades,
        SUM(cantidad * precio_compra) as valor_compra
      FROM Inventario
      WHERE usuario_id = ? AND activo = 1
      GROUP BY categoria
      ORDER BY valor_compra DESC
    `).bind(usuarioId).all(),

    // Low stock items
    DB.prepare(`
      SELECT id, codigo, nombre, categoria, cantidad, cantidad_minima, precio_venta
      FROM Inventario
      WHERE usuario_id = ? AND activo = 1 AND cantidad <= cantidad_minima
      ORDER BY cantidad ASC
      LIMIT 50
    `).bind(usuarioId).all(),

    // Recent movements
    DB.prepare(`
      SELECT mi.*, i.nombre as item_nombre, i.codigo as item_codigo
      FROM MovimientosInventario mi
      JOIN Inventario i ON mi.inventario_id = i.id
      WHERE i.usuario_id = ?
      ORDER BY mi.creado_en DESC
      LIMIT 50
    `).bind(usuarioId).all(),
  ]);

  return jsonResponse({
    tipo: 'inventario',
    resumen: {
      total_items: resumen?.total_items || 0,
      total_unidades: resumen?.total_unidades || 0,
      valor_compra: resumen?.valor_inventario_compra || 0,
      valor_venta: resumen?.valor_inventario_venta || 0,
    },
    por_categoria: porCategoria.results || [],
    stock_bajo: stockBajo.results || [],
    ultimos_movimientos: ultimosMovimientos.results || [],
  });
}
