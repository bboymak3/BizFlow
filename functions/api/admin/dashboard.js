// ============================================================
// BizFlow - Admin Dashboard API
// GET: Full dashboard KPIs with period filtering
// ============================================================

import {
  corsHeaders,
  handleOptions,
  successRes,
  errorRes,
  chileDate,
  getFechaColumn,
  buildFechaWhere,
  asegurarColumnasFaltantes,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const periodo = url.searchParams.get('periodo') || 'mes';
  const valor = url.searchParams.get('valor') || chileDate();

  try {
    await asegurarColumnasFaltantes(env);
    const fechaCol = await getFechaColumn(env);
    const fechaWhere = buildFechaWhere(fechaCol, periodo, valor);
    const whereClause = fechaWhere.where || '';
    const params = fechaWhere.params || [];

    const whereBase = `WHERE ot.estado != 'Eliminada' AND (ot.negocio_id = 1 OR ot.negocio_id IS NULL)${whereClause}`;

    // Run all KPI queries in parallel
    const [
      ordenesCount,
      totalGenerado,
      totalAbonos,
      servicios,
      rendimiento,
      metodoPago,
      gastos,
    ] = await Promise.all([
      // Order status counts
      env.DB.prepare(`
        SELECT
          COUNT(*) as total_ordenes,
          SUM(CASE WHEN ot.estado = 'Aprobada' THEN 1 ELSE 0 END) as ordenes_aprobadas,
          SUM(CASE WHEN ot.estado = 'Cancelada' THEN 1 ELSE 0 END) as canceladas,
          SUM(CASE WHEN ot.estado = 'Cerrada' OR ot.estado = 'cerrada' THEN 1 ELSE 0 END) as cerradas,
          SUM(CASE WHEN ot.estado_trabajo = 'En Proceso' OR ot.estado_trabajo = 'en_progreso' THEN 1 ELSE 0 END) as en_proceso,
          SUM(CASE WHEN ot.estado = 'Enviada' THEN 1 ELSE 0 END) as pendientes
        FROM OrdenesTrabajo ot
        ${whereBase}
      `).bind(...params).first(),

      // Total revenue
      env.DB.prepare(`
        SELECT
          COALESCE(SUM(COALESCE(ot.monto_final, ot.monto_base, 0)), 0) as total_generado,
          COALESCE(AVG(COALESCE(ot.monto_final, ot.monto_base, 0)), 0) as promedio_orden
        FROM OrdenesTrabajo ot
        ${whereBase} AND (ot.estado = 'Cerrada' OR ot.estado = 'cerrada' OR ot.estado = 'Aprobada')
      `).bind(...params).first(),

      // Total payments received
      env.DB.prepare(`
        SELECT COALESCE(SUM(COALESCE(abono, 0)), 0) as total_abonos
        FROM OrdenesTrabajo ot
        ${whereBase} AND (ot.estado != 'Cancelada' AND ot.estado != 'Eliminada')
      `).bind(...params).first(),

      // Top 5 most requested services
      env.DB.prepare(`
        SELECT
          so.nombre_servicio as servicio,
          COUNT(*) as cantidad,
          AVG(so.precio) as promedio_precio
        FROM ServiciosOrden so
        JOIN OrdenesTrabajo ot ON so.orden_id = ot.id
        ${whereBase}
        GROUP BY so.nombre_servicio
        ORDER BY cantidad DESC
        LIMIT 5
      `).bind(...params).all(),

      // Performance by technician
      env.DB.prepare(`
        SELECT
          t.id,
          t.nombre,
          COUNT(ot.id) as ordenes,
          COALESCE(SUM(COALESCE(ot.monto_final, ot.monto_base, 0)), 0) as facturado,
          SUM(CASE WHEN ot.estado = 'Cerrada' OR ot.estado = 'cerrada' THEN 1 ELSE 0 END) as cerradas
        FROM Tecnicos t
        LEFT JOIN OrdenesTrabajo ot ON ot.tecnico_asignado_id = t.id
        WHERE (t.negocio_id = 1 OR t.negocio_id IS NULL)
        ${whereClause.replace('AND', 'AND (ot.estado != \'Eliminada\') AND')}
        GROUP BY t.id, t.nombre
        HAVING ordenes > 0
        ORDER BY facturado DESC
      `).bind(...params).all(),

      // Payment method distribution
      env.DB.prepare(`
        SELECT
          COALESCE(metodo_pago, 'efectivo') as metodo,
          COUNT(*) as cantidad,
          SUM(COALESCE(monto_final, monto_base, 0)) as total
        FROM OrdenesTrabajo ot
        ${whereBase}
        GROUP BY metodo_pago
        ORDER BY total DESC
      `).bind(...params).all(),

      // Expenses by category
      env.DB.prepare(`
        SELECT
          COALESCE(categoria, 'otro') as categoria,
          COUNT(*) as cantidad,
          COALESCE(SUM(monto), 0) as total
        FROM GastosNegocio
        WHERE (negocio_id = 1 OR negocio_id IS NULL)
        ${fechaWhere.where ? fechaWhere.where.replace('fecha_creacion', 'fecha_gasto') : ''}
        GROUP BY categoria
        ORDER BY total DESC
      `).bind(...fechaWhere.params || []).all(),
    ]);

    // Calculate remaining (total - abonos)
    const totalGasto = gastos.results.reduce((sum, g) => sum + (g.total || 0), 0);

    // Calculate technician commissions (rough estimate)
    const comisiones = rendimiento.results.reduce((sum, t) => {
      const comision = await getTecComision(env, t.id);
      return sum + (t.facturado * comision / 100);
    }, 0);

    const totalGeneradoNum = ordenesCount?.total_generado || 0;
    const totalAbonosNum = totalAbonos?.total_abonos || 0;

    return successRes({
      kpis: {
        total_ordenes: ordenesCount?.total_ordenes || 0,
        ordenes_aprobadas: ordenesCount?.ordenes_aprobadas || 0,
        canceladas: ordenesCount?.canceladas || 0,
        cerradas: ordenesCount?.cerradas || 0,
        en_proceso: ordenesCount?.en_proceso || 0,
        pendientes: ordenesCount?.pendientes || 0,
      },
      finanzas: {
        total_generado: totalGeneradoNum,
        total_abonos: totalAbonosNum,
        total_restante: totalGeneradoNum - totalAbonosNum,
        promedio_orden: totalGenerado?.promedio_orden || 0,
        total_gastos: totalGasto,
        balance_neto: totalGeneradoNum - totalGasto - comisiones,
        comisiones_estimadas: comisiones,
      },
      servicios_mas_solicitados: servicios.results || [],
      rendimiento_por_tecnico: rendimiento.results || [],
      distribucion_metodo_pago: metodoPago.results || [],
      gastos_por_categoria: gastos.results || [],
      periodo: {
        tipo: periodo,
        valor,
        fecha: chileDate(),
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return errorRes('Error cargando dashboard: ' + error.message, 500);
  }
}

async function getTecComision(env, tecId) {
  const tec = await env.DB.prepare(
    `SELECT comision_porcentaje FROM Tecnicos WHERE id = ?`
  ).bind(tecId).first();
  return tec?.comision_porcentaje || 10;
}
