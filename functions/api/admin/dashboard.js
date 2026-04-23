// ============================================================
// BizFlow - Admin Dashboard API
// GET: Dashboard stats, KPIs, charts data
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
    let usuarioId = url.searchParams.get('usuario_id');

    if (!usuarioId) {
      usuarioId = '1';
    }

    // Run all dashboard queries in parallel
    const [
      totalOTs,
      otsByStatus,
      totalRevenue,
      recentOTs,
      recentClients,
      monthlyRevenue,
      topTecnicos,
      otsByPriority,
    ] = await Promise.all([
      // Total OTs count
      DB.prepare(`
        SELECT COUNT(*) as total FROM OrdenesTrabajo
        WHERE usuario_id = ?
      `).bind(usuarioId).first(),

      // OTs grouped by status
      DB.prepare(`
        SELECT estado, COUNT(*) as cantidad
        FROM OrdenesTrabajo
        WHERE usuario_id = ?
        GROUP BY estado
        ORDER BY cantidad DESC
      `).bind(usuarioId).all(),

      // Total revenue from completed/closed orders
      DB.prepare(`
        SELECT
          COALESCE(SUM(total), 0) as total_ingresos,
          COALESCE(SUM(subtotal), 0) as total_subtotal,
          COALESCE(SUM(impuesto), 0) as total_impuesto,
          COUNT(*) as ordenes_facturadas
        FROM OrdenesTrabajo
        WHERE usuario_id = ?
          AND estado IN ('completada', 'aprobada', 'cerrada')
      `).bind(usuarioId).first(),

      // Recent 10 OTs
      DB.prepare(`
        SELECT
          ot.id, ot.numero, ot.estado, ot.titulo, ot.total,
          ot.fecha_creacion, ot.prioridad,
          c.nombre as cliente_nombre, c.empresa as cliente_empresa,
          v.placa,
          t.nombre as tecnico_nombre
        FROM OrdenesTrabajo ot
        LEFT JOIN Clientes c ON ot.cliente_id = c.id
        LEFT JOIN Vehiculos v ON ot.vehiculo_id = v.id
        LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
        WHERE ot.usuario_id = ?
        ORDER BY ot.fecha_creacion DESC
        LIMIT 10
      `).bind(usuarioId).all(),

      // Recent 5 clients
      DB.prepare(`
        SELECT id, nombre, apellido, empresa, email, telefono, creado_en
        FROM Clientes
        WHERE usuario_id = ? AND activo = 1
        ORDER BY creado_en DESC
        LIMIT 5
      `).bind(usuarioId).all(),

      // Monthly revenue last 12 months
      DB.prepare(`
        SELECT
          strftime('%Y-%m', fecha_creacion) as mes,
          COALESCE(SUM(CASE WHEN estado IN ('completada', 'aprobada', 'cerrada') THEN total ELSE 0 END), 0) as ingresos,
          COUNT(*) as total_ot,
          COUNT(CASE WHEN estado IN ('completada', 'aprobada', 'cerrada') THEN 1 END) as ot_completadas
        FROM OrdenesTrabajo
        WHERE usuario_id = ?
          AND fecha_creacion >= datetime('now', '-12 months')
        GROUP BY strftime('%Y-%m', fecha_creacion)
        ORDER BY mes ASC
      `).bind(usuarioId).all(),

      // Top technicians by completed OTs
      DB.prepare(`
        SELECT
          t.id, t.nombre, t.especialidad,
          COUNT(ot.id) as total_ot,
          SUM(CASE WHEN ot.estado IN ('completada', 'cerrada') THEN 1 ELSE 0 END) as completadas,
          COALESCE(SUM(CASE WHEN ot.estado IN ('completada', 'cerrada') THEN ot.total ELSE 0 END), 0) as facturado
        FROM Tecnicos t
        LEFT JOIN OrdenesTrabajo ot ON ot.tecnico_id = t.id AND ot.usuario_id = ?
        WHERE t.usuario_id = ? AND t.activo = 1
        GROUP BY t.id, t.nombre, t.especialidad
        ORDER BY completadas DESC
        LIMIT 10
      `).bind(usuarioId, usuarioId).all(),

      // OTs by priority
      DB.prepare(`
        SELECT prioridad, COUNT(*) as cantidad
        FROM OrdenesTrabajo
        WHERE usuario_id = ?
        GROUP BY prioridad
      `).bind(usuarioId).all(),
    ]);

    // Build status map from results
    const statusMap = {};
    for (const row of (otsByStatus.results || [])) {
      statusMap[row.estado] = row.cantidad;
    }

    const priorityMap = {};
    for (const row of (otsByPriority.results || [])) {
      priorityMap[row.prioridad] = row.cantidad;
    }

    // Total payments received
    const pagosResult = await DB.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total_pagado
      FROM Pagos p
      JOIN OrdenesTrabajo ot ON p.orden_id = ot.id
      WHERE ot.usuario_id = ?
    `).bind(usuarioId).first();

    // Total expenses
    const gastosResult = await DB.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total_gastos
      FROM GastosNegocio
      WHERE usuario_id = ?
    `).bind(usuarioId).first();

    return jsonResponse({
      kpis: {
        total_ots: totalOTs?.total || 0,
        por_estado: statusMap,
        por_prioridad: priorityMap,
        pendientes: statusMap['pendiente'] || 0,
        asignadas: statusMap['asignada'] || 0,
        en_proceso: statusMap['en_proceso'] || 0,
        completadas: statusMap['completada'] || 0,
        canceladas: statusMap['cancelada'] || 0,
      },
      finanzas: {
        total_ingresos: totalRevenue?.total_ingresos || 0,
        total_subtotal: totalRevenue?.total_subtotal || 0,
        total_impuesto: totalRevenue?.total_impuesto || 0,
        total_pagado: pagosResult?.total_pagado || 0,
        total_gastos: gastosResult?.total_gastos || 0,
        balance_neto: ((totalRevenue?.total_ingresos || 0) - (gastosResult?.total_gastos || 0)),
        ordenes_facturadas: totalRevenue?.ordenes_facturadas || 0,
      },
      ordenes_recientes: recentOTs.results || [],
      clientes_recientes: recentClients.results || [],
      ingresos_mensuales: monthlyRevenue.results || [],
      top_tecnicos: topTecnicos.results || [],
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return errorResponse('Error cargando dashboard: ' + error.message, 500);
  }
}
