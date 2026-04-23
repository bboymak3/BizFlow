// ============================================================
// BizFlow - Resumen de Pagos API
// GET: Payment summary for ?periodo&valor
// Grouped by metodo_pago with totals
// ============================================================

import {
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

    const whereClause = `
      ot.estado != 'Eliminada'
      AND ot.estado != 'Cancelada'
      AND (ot.negocio_id = 1 OR ot.negocio_id IS NULL)
      ${fechaWhere.where}
    `;
    const params = [...fechaWhere.params];

    // Run queries in parallel
    const [
      porMetodo,
      totalesGenerales,
      porEstado,
      pagosRecibidos,
    ] = await Promise.all([
      // Grouped by payment method
      env.DB.prepare(`
        SELECT
          COALESCE(ot.metodo_pago, 'efectivo') as metodo_pago,
          COUNT(*) as cantidad_ordenes,
          COALESCE(SUM(COALESCE(ot.monto_final, ot.monto_base, ot.monto_total, 0)), 0) as total_monto,
          COALESCE(SUM(COALESCE(ot.monto_abono, ot.abono, 0)), 0) as total_abonos,
          COALESCE(AVG(COALESCE(ot.monto_final, ot.monto_base, ot.monto_total, 0)), 0) as promedio
        FROM OrdenesTrabajo ot
        WHERE ${whereClause}
        GROUP BY ot.metodo_pago
        ORDER BY total_monto DESC
      `).bind(...params).all(),

      // Overall totals
      env.DB.prepare(`
        SELECT
          COUNT(*) as total_ordenes,
          COALESCE(SUM(COALESCE(ot.monto_final, ot.monto_base, ot.monto_total, 0)), 0) as monto_total_bruto,
          COALESCE(SUM(COALESCE(ot.monto_abono, ot.abono, 0)), 0) as total_pagado,
          COALESCE(SUM(CASE WHEN ot.estado IN ('Cerrada','cerrada') THEN COALESCE(ot.monto_final, ot.monto_base, 0) ELSE 0 END), 0) as total_cerrado,
          COALESCE(SUM(CASE WHEN ot.estado = 'Aprobada' THEN COALESCE(ot.monto_final, ot.monto_base, 0) ELSE 0 END), 0) as total_aprobado
        FROM OrdenesTrabajo ot
        WHERE ${whereClause}
      `).bind(...params).first(),

      // By order state
      env.DB.prepare(`
        SELECT
          ot.estado,
          COUNT(*) as cantidad,
          COALESCE(SUM(COALESCE(ot.monto_final, ot.monto_base, ot.monto_total, 0)), 0) as total
        FROM OrdenesTrabajo ot
        WHERE ${whereClause}
        GROUP BY ot.estado
        ORDER BY cantidad DESC
      `).bind(...params).all(),

      // Check Pagos table if it exists
      env.DB.prepare(`
        SELECT
          COALESCE(p.metodo_pago, 'efectivo') as metodo_pago,
          COUNT(*) as cantidad_pagos,
          COALESCE(SUM(p.monto), 0) as total_pagado
        FROM Pagos p
        WHERE (p.negocio_id = 1 OR p.negocio_id IS NULL)
          AND p.fecha_pago >= ? AND p.fecha_pago <= ?
        GROUP BY p.metodo_pago
        ORDER BY total_pagado DESC
      `).bind(
        params[0] || chileDate(),
        params[1] || chileDate()
      ).all().catch(() => ({ results: [] })),
    ]);

    const montoBruto = totalesGenerales?.monto_total_bruto || 0;
    const totalPagado = totalesGenerales?.total_pagado || 0;
    const porcentajeCobrado = montoBruto > 0 ? Math.round((totalPagado / montoBruto) * 100) : 0;

    return successRes({
      periodo: { tipo: periodo, valor },
      resumen_general: {
        total_ordenes: totalesGenerales?.total_ordenes || 0,
        monto_total_bruto: montoBruto,
        total_cobrado: totalPagado,
        total_pendiente: Math.max(0, montoBruto - totalPagado),
        porcentaje_cobrado,
        total_cerrado: totalesGenerales?.total_cerrado || 0,
        total_aprobado: totalesGenerales?.total_aprobado || 0,
      },
      por_metodo_pago: porMetodo.results || [],
      por_estado: porEstado.results || [],
      pagos_directos: (pagosRecibidos.results || []).length > 0 ? pagosRecibidos.results : [],
    });
  } catch (error) {
    console.error('Resumen pagos error:', error);
    return errorRes('Error obteniendo resumen de pagos: ' + error.message, 500);
  }
}
