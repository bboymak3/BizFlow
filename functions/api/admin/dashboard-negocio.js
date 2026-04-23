// ============================================
// API: DASHBOARD GENERAL DEL NEGOCIO
// Con desglose de costos por categoría (Mano de Obra vs Repuestos)
// Auto-crea tablas si no existen
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes, buildFechaWhereGP as buildFechaWhere } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor');

    // SIEMPRE usar o.fecha_ingreso para filtrar (columna 100% segura)
    const { condicion: rawFechaCond, params: fechaParams } = buildFechaWhere('o.fecha_ingreso', periodo, valor);
    const fechaCondicion = rawFechaCond ? `WHERE ${rawFechaCond}` : '';
    const params = [...fechaParams];

    // 1. Resumen general de órdenes
    const resumen = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_ordenes,
        SUM(CASE WHEN estado = 'Aprobada' THEN 1 ELSE 0 END) as ordenes_aprobadas,
        SUM(CASE WHEN estado = 'Cancelada' THEN 1 ELSE 0 END) as ordenes_canceladas,
        SUM(CASE WHEN estado_trabajo = 'Cerrada' THEN 1 ELSE 0 END) as ordenes_cerradas,
        SUM(CASE WHEN estado_trabajo = 'En camino' THEN 1 ELSE 0 END) as ordenes_en_camino,
        SUM(CASE WHEN estado_trabajo = 'En trabajo' THEN 1 ELSE 0 END) as ordenes_en_trabajo,
        SUM(CASE WHEN estado_trabajo = 'Pendiente Visita' THEN 1 ELSE 0 END) as ordenes_pendientes,
        COALESCE(SUM(monto_total), 0) as total_generado_base,
        COALESCE(SUM(monto_abono), 0) as total_abonos,
        COALESCE(SUM(monto_restante), 0) as total_restantes,
        AVG(monto_total) as promedio_orden
      FROM OrdenesTrabajo
      ${fechaCondicion}
    `).bind(...params).first();

    // 2. Costos adicionales del periodo
    let costosQuery = `SELECT COUNT(*) as total_items_costos,
      COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
      COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
      COALESCE(SUM(monto), 0) as total_costos_adicionales
      FROM CostosAdicionales`;
    let costosParams = [];
    if (valor) {
      switch (periodo) {
        case 'dia': costosQuery += ' WHERE date(fecha_registro) = ?'; costosParams.push(valor); break;
        case 'semana': { const [yr, wk] = valor.split('-').map(Number); costosQuery += " WHERE strftime('%Y', fecha_registro) = ? AND cast(strftime('%W', fecha_registro) as integer) = ?"; costosParams.push(String(yr), wk); break; }
        case 'anio': costosQuery += " WHERE strftime('%Y', fecha_registro) = ?"; costosParams.push(valor); break;
        default: costosQuery += " WHERE strftime('%Y-%m', fecha_registro) = ?"; costosParams.push(valor); break;
      }
    }
    const costos = await env.DB.prepare(costosQuery).bind(...costosParams).first();

    const totalGeneradoBase = Number(resumen?.total_generado_base || 0);
    const totalCostosManoObra = Number(costos?.total_mano_obra || 0);
    const totalCostosRepuestos = Number(costos?.total_repuestos || 0);
    const totalCostosExtras = Number(costos?.total_costos_adicionales || 0);
    const totalGeneradoConExtras = totalGeneradoBase + totalCostosExtras;

    // 3. Gastos del negocio del periodo
    let gastosQuery = `SELECT COUNT(*) as total_gastos, COALESCE(SUM(monto), 0) as total_gastos_monto, categoria FROM GastosNegocio`;
    let gastosParams = [];
    if (valor) {
      switch (periodo) {
        case 'dia': gastosQuery += ' WHERE fecha_gasto = ?'; gastosParams.push(valor); break;
        case 'semana': { const [y, w] = valor.split('-').map(Number); gastosQuery += " WHERE strftime('%Y', fecha_gasto) = ? AND cast(strftime('%W', fecha_gasto) as integer) = ?"; gastosParams.push(String(y), w); break; }
        case 'anio': gastosQuery += " WHERE strftime('%Y', fecha_gasto) = ?"; gastosParams.push(valor); break;
        default: gastosQuery += " WHERE strftime('%Y-%m', fecha_gasto) = ?"; gastosParams.push(valor); break;
      }
    }
    gastosQuery += ' GROUP BY categoria';
    const { results: gastosPorCategoria } = await env.DB.prepare(gastosQuery).bind(...gastosParams).all();
    const totalGastos = gastosPorCategoria.reduce((sum, g) => sum + Number(g.total_gastos_monto || 0), 0);

    // 4. Órdenes por técnico
    let tecnicosWhere = 'WHERE o.tecnico_asignado_id IS NOT NULL';
    let tecnicosParams = [];
    if (rawFechaCond) {
      tecnicosWhere += ` AND ${rawFechaCond}`;
      tecnicosParams = [...fechaParams];
    }
    const tecnicosResult = await env.DB.prepare(`
      SELECT t.nombre as tecnico_nombre, t.id as tecnico_id,
        COUNT(*) as total_ordenes,
        COALESCE(SUM(o.monto_total), 0) as total_generado_base,
        SUM(CASE WHEN o.estado_trabajo = 'Cerrada' THEN 1 ELSE 0 END) as ordenes_cerradas
      FROM OrdenesTrabajo o LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
      ${tecnicosWhere}
      GROUP BY o.tecnico_asignado_id ORDER BY total_ordenes DESC
    `).bind(...tecnicosParams).all();

    // Agregar costos adicionales por técnico
    const tecnicosConCostos = await Promise.all((tecnicosResult.results || []).map(async t => {
      const costosTecnico = await env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN ca.categoria = 'Mano de Obra' THEN ca.monto ELSE 0 END), 0) as total_mano_obra,
          COALESCE(SUM(CASE WHEN ca.categoria = 'Repuestos/Materiales' THEN ca.monto ELSE 0 END), 0) as total_repuestos,
          COALESCE(SUM(ca.monto), 0) as total_costos
        FROM CostosAdicionales ca
        INNER JOIN OrdenesTrabajo o ON ca.orden_id = o.id
        WHERE o.tecnico_asignado_id = ?
        ${valor ? (periodo === 'dia' ? "AND date(ca.fecha_registro) = ?" : periodo === 'anio' ? "AND strftime('%Y', ca.fecha_registro) = ?" : "AND strftime('%Y-%m', ca.fecha_registro) = ?") : ''}
      `).bind(...(valor ? [t.tecnico_id, valor] : [t.tecnico_id])).first();
      const costosMO = Number(costosTecnico?.total_mano_obra || 0);
      const costosRM = Number(costosTecnico?.total_repuestos || 0);
      const costosT = Number(costosTecnico?.total_costos || 0);
      return { ...t, total_costos_mano_obra: costosMO, total_costos_repuestos: costosRM, total_costos_adicionales: costosT, total_generado: Number(t.total_generado_base || 0) + costosT, base_comisionable: Number(t.total_generado_base || 0) + costosMO };
    }));

    // 5. Trabajos más solicitados
    const trabajosResult = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN trabajo_frenos = 1 THEN 1 ELSE 0 END) as frenos,
        SUM(CASE WHEN trabajo_luces = 1 THEN 1 ELSE 0 END) as luces,
        SUM(CASE WHEN trabajo_tren_delantero = 1 THEN 1 ELSE 0 END) as tren_delantero,
        SUM(CASE WHEN trabajo_correas = 1 THEN 1 ELSE 0 END) as correas,
        SUM(CASE WHEN trabajo_componentes = 1 THEN 1 ELSE 0 END) as componentes
      FROM OrdenesTrabajo ${fechaCondicion}
    `).bind(...params).first();

    // 6. Desglose por método de pago
    const pagosWhere = fechaCondicion ? `${fechaCondicion} AND` : 'WHERE';
    const pagosResult = await env.DB.prepare(`
      SELECT metodo_pago, COUNT(*) as cantidad, COALESCE(SUM(monto_abono), 0) as total
      FROM OrdenesTrabajo ${pagosWhere} metodo_pago IS NOT NULL AND metodo_pago != ''
      GROUP BY metodo_pago
    `).bind(...(fechaCondicion ? params : [])).all();

    // 7. Calcular comisiones SOLO sobre mano de obra (excluir repuestos)
    let totalMOFromServicios = 0;
    try {
      const srvWhere = fechaCondicion ? `${fechaCondicion} AND` : 'WHERE';
      const ordenesServicios = await env.DB.prepare(`
        SELECT servicios_seleccionados FROM OrdenesTrabajo ${srvWhere} servicios_seleccionados IS NOT NULL AND servicios_seleccionados != ''
      `).bind(...(fechaCondicion ? params : [])).all();
      (ordenesServicios.results || []).forEach(row => {
        if (row.servicios_seleccionados) {
          try {
            const srvs = typeof row.servicios_seleccionados === 'string'
              ? JSON.parse(row.servicios_seleccionados) : row.servicios_seleccionados;
            if (Array.isArray(srvs)) {
              srvs.forEach(s => {
                if (s.tipo_comision === 'mano_obra') {
                  totalMOFromServicios += Number(s.precio_final || s.precio_sugerido || 0);
                }
              });
            }
          } catch (e) {}
        }
      });
    } catch (e) {}

    // Obtener comisión promedio de todos los técnicos
    const { results: tecnicosComision } = await env.DB.prepare(`
      SELECT COALESCE(AVG(comision_porcentaje), 40) as avg_comision
      FROM Tecnicos WHERE comision_porcentaje IS NOT NULL AND comision_porcentaje > 0
    `).all();
    const comisionPromedio = Number(tecnicosComision?.[0]?.avg_comision || 40);
    const factorComision = comisionPromedio / 100;

    // Base comisionable = SOLO mano de obra (del catálogo + costos extra MO)
    const baseComisionable = totalMOFromServicios > 0
      ? totalMOFromServicios + totalCostosManoObra
      : totalGeneradoBase + totalCostosManoObra;
    const totalComisiones = Math.round(baseComisionable * factorComision);

    return new Response(JSON.stringify({
      success: true, periodo, valor: valor || null,
      resumen: {
        total_ordenes: resumen?.total_ordenes || 0,
        ordenes_aprobadas: resumen?.ordenes_aprobadas || 0,
        ordenes_canceladas: resumen?.ordenes_canceladas || 0,
        ordenes_cerradas: resumen?.ordenes_cerradas || 0,
        ordenes_en_proceso: (resumen?.ordenes_en_camino || 0) + (resumen?.ordenes_en_trabajo || 0),
        ordenes_pendientes: resumen?.ordenes_pendientes || 0,
        total_generado: totalGeneradoConExtras,
        total_generado_base: totalGeneradoBase,
        total_abonos: Number(resumen?.total_abonos || 0),
        total_restantes: Number(resumen?.total_restantes || 0),
        promedio_orden: Math.round(Number(resumen?.promedio_orden || 0))
      },
      costos_adicionales: { total_items: costos?.total_items_costos || 0, total_monto: totalCostosExtras, desglose: { mano_de_obra: totalCostosManoObra, repuestos_materiales: totalCostosRepuestos } },
      gastos: { total_gastos: gastosPorCategoria.length, total_monto: totalGastos, por_categoria: gastosPorCategoria },
      comisiones_tecnicos: totalComisiones, base_comisionable: baseComisionable, comision_porcentaje: comisionPromedio,
      formula_comision: `(Mano de Obra de servicios + Costos MO extra) x ${comisionPromedio}%. Los repuestos NO generan comisión.`,
      balance: totalGeneradoConExtras - totalComisiones - totalGastos,
      por_tecnico: tecnicosConCostos,
      trabajos_mas_solicitados: trabajosResult || {},
      por_metodo_pago: pagosResult.results || []
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error al obtener dashboard:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
