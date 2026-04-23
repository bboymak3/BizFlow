// ============================================
// API: LIQUIDACIÓN DE TÉCNICOS
// FÓRMULA DINÁMICA: Pago = (Mano de Obra del catálogo + Costos MO extra) × comisión_técnico%
// Los REPUESTOS NO generan comisión para el técnico
// La comisión es individual por técnico (default 40%)
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes, getColumnas, buildFechaWhereGP as buildFechaWhere } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);
    const colOT = await getColumnas(env, 'OrdenesTrabajo');
    const colTec = await getColumnas(env, 'Tecnicos');
    const tieneComision = colTec.includes('comision_porcentaje');

    const url = new URL(request.url);
    const tecnicoId = url.searchParams.get('tecnico_id');
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor');

    if (!tecnicoId) {
      return new Response(JSON.stringify({ success: false, error: 'Se requiere el ID del técnico' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Obtener datos del técnico con su comisión
    const tecSelect = tieneComision ? 'id, nombre, comision_porcentaje' : 'id, nombre';
    const tecnico = await env.DB.prepare(`SELECT ${tecSelect} FROM Tecnicos WHERE id = ?`).bind(tecnicoId).first();

    if (!tecnico) {
      return new Response(JSON.stringify({ success: false, error: 'Técnico no encontrado' }), {
        headers: { 'Content-Type': 'application/json' }, status: 404
      });
    }

    const comisionPorcentaje = Number(tecnico.comision_porcentaje || 40);
    const factorComision = comisionPorcentaje / 100;

    // Construir condición de fecha - SIEMPRE usar o.fecha_ingreso (columna 100% segura)
    const { condicion: fechaWhere, params: fechaParams } = buildFechaWhere('o.fecha_ingreso', periodo, valor);
    const fechaCondicion = fechaWhere ? `AND ${fechaWhere}` : '';

    // SELECT de columnas que pueden no existir
    const tieneFechaCompletado = colOT.includes('fecha_completado');
    const tieneServicios = colOT.includes('servicios_seleccionados');
    let selectFechaCompletado = '';
    if (tieneFechaCompletado) selectFechaCompletado = ', o.fecha_completado';
    let selectServicios = '';
    if (tieneServicios) selectServicios = ', o.servicios_seleccionados';

    // Obtener órdenes con costos desglosados por categoría
    const params = [tecnicoId, ...fechaParams];
    let ordenes;
    try {
      ordenes = await env.DB.prepare(`
        SELECT
          o.id, o.numero_orden, o.cliente_nombre, o.direccion, o.patente_placa,
          o.fecha_ingreso as fecha_creacion
          ${selectFechaCompletado}
          ${selectServicios},
          o.monto_total, o.monto_abono, o.monto_restante,
          o.estado, o.estado_trabajo,
          COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
          COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
          COALESCE(ca.total_general, 0) as total_costos_adicionales
        FROM OrdenesTrabajo o
        LEFT JOIN (
          SELECT
            orden_id,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
            COALESCE(SUM(monto), 0) as total_general
          FROM CostosAdicionales
          GROUP BY orden_id
        ) ca ON ca.orden_id = o.id
        WHERE o.tecnico_asignado_id = ?
          AND (o.estado = 'Aprobada' OR o.estado_trabajo = 'Cerrada')
        ${fechaCondicion}
        ORDER BY o.fecha_ingreso DESC
      `).bind(...params).all();
    } catch (queryError) {
      // Fallback: query sin columnas opcionales
      console.log('Liquidar query fallback:', queryError.message);
      ordenes = await env.DB.prepare(`
        SELECT
          o.id, o.numero_orden, o.cliente_nombre, o.direccion, o.patente_placa,
          o.fecha_ingreso as fecha_creacion,
          o.monto_total, o.monto_abono, o.monto_restante,
          o.estado, o.estado_trabajo,
          COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
          COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
          COALESCE(ca.total_general, 0) as total_costos_adicionales
        FROM OrdenesTrabajo o
        LEFT JOIN (
          SELECT
            orden_id,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
            COALESCE(SUM(monto), 0) as total_general
          FROM CostosAdicionales
          GROUP BY orden_id
        ) ca ON ca.orden_id = o.id
        WHERE o.tecnico_asignado_id = ?
          AND (o.estado = 'Aprobada' OR o.estado_trabajo = 'Cerrada')
        ORDER BY o.fecha_ingreso DESC
      `).bind(tecnicoId).all();
    }

    const ordenesList = (ordenes.results || []).map(orden => {
      const montoBase = Number(orden.monto_total || 0);
      const costosManoObra = Number(orden.total_costos_mano_obra || 0);
      const costosRepuestos = Number(orden.total_costos_repuestos || 0);
      const costosTotales = Number(orden.total_costos_adicionales || 0);

      // Separar mano de obra vs repuestos de los servicios del catálogo
      let manoObraServicios = 0;
      let repuestosServicios = 0;
      if (orden.servicios_seleccionados) {
        try {
          const srvs = typeof orden.servicios_seleccionados === 'string'
            ? JSON.parse(orden.servicios_seleccionados)
            : orden.servicios_seleccionados;
          if (Array.isArray(srvs)) {
            srvs.forEach(s => {
              const precio = Number(s.precio_final || s.precio_sugerido || 0);
              if (s.tipo_comision === 'mano_obra') {
                manoObraServicios += precio;
              } else {
                repuestosServicios += precio;
              }
            });
          }
        } catch (e) { /* formato inválido, usar monto_total completo como base */ }
      }

      // Si no hay servicios_seleccionados parseables, estimar proporción
      if (manoObraServicios === 0 && repuestosServicios === 0 && montoBase > 0) {
        manoObraServicios = montoBase; // sin catálogo, asumir todo como mano de obra
      }

      // Base comisionable = SOLO mano de obra (catálogo + costos extra)
      const baseComisionable = manoObraServicios + costosManoObra;
      const gananciaTecnico = Math.round(baseComisionable * factorComision);
      const totalCliente = montoBase + costosTotales;

      return {
        ...orden,
        mano_obra_servicios: manoObraServicios,
        repuestos_servicios: repuestosServicios,
        total_costos_mano_obra: costosManoObra,
        total_costos_repuestos: costosRepuestos,
        total_costos_adicionales: costosTotales,
        base_comisionable: baseComisionable,
        total_cliente: totalCliente,
        ganancia_tecnico: gananciaTecnico,
        comision_aplicada: comisionPorcentaje,
        estado_resumen: orden.estado_trabajo === 'Cerrada' ? 'Cerrada' : (orden.estado || 'N/A')
      };
    });

    const totalBase = ordenesList.reduce((sum, o) => sum + Number(o.monto_total || 0), 0);
    const totalManoObra = ordenesList.reduce((sum, o) => sum + o.total_costos_mano_obra, 0);
    const totalRepuestos = ordenesList.reduce((sum, o) => sum + o.total_costos_repuestos, 0);
    const totalCostosExtras = ordenesList.reduce((sum, o) => sum + o.total_costos_adicionales, 0);
    const totalMOFromServicios = ordenesList.reduce((sum, o) => sum + (o.mano_obra_servicios || 0), 0);
    const totalRepFromServicios = ordenesList.reduce((sum, o) => sum + (o.repuestos_servicios || 0), 0);
    const totalBaseComisionable = totalMOFromServicios + totalManoObra;
    const totalCliente = totalBase + totalCostosExtras;
    const totalTecnico = Math.round(totalBaseComisionable * factorComision);

    return new Response(JSON.stringify({
      success: true,
      tecnico: { id: tecnico.id, nombre: tecnico.nombre, comision_porcentaje: comisionPorcentaje },
      tecnico_id: tecnicoId, periodo, valor: valor || null,
      ordenes: ordenesList,
      totalOt: ordenesList.length,
      totalGenerado: totalCliente,
      totalBaseOriginal: totalBase,
      desgloseServicios: { mano_de_obra: totalMOFromServicios, repuestos: totalRepFromServicios },
      desgloseCostos: { mano_de_obra: totalManoObra, repuestos_materiales: totalRepuestos, total: totalCostosExtras },
      baseComisionable: totalBaseComisionable,
      totalTecnico,
      formula: `(Mano de Obra de servicios + Costos MO extra) x ${comisionPorcentaje}%`
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error al obtener liquidación de técnicos:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
