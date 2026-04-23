// ============================================================
// BizFlow - Liquidar Técnicos API
// GET: Calculate commissions for ?periodo&valor&tecnico_id
// Returns breakdown per technician with per-order details
// ============================================================

import {
  handleOptions,
  successRes,
  errorRes,
  chileDate,
  getFechaColumn,
  buildFechaWhere,
  asegurarColumnasFaltantes,
  getColumnas,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const periodo = url.searchParams.get('periodo') || 'mes';
  const valor = url.searchParams.get('valor') || chileDate();
  const tecnicoId = url.searchParams.get('tecnico_id');

  try {
    await asegurarColumnasFaltantes(env);

    const fechaCol = await getFechaColumn(env);
    const fechaWhere = buildFechaWhere(fechaCol, periodo, valor);

    // Check if CostosAdicionales has categoria column
    const costosCols = await getColumnas(env, 'CostosAdicionales');

    // Base where for closed/approved orders in the period
    const baseWhere = `
      ot.estado IN ('Cerrada', 'cerrada', 'Aprobada')
      AND ot.estado != 'Eliminada'
      AND ot.estado != 'Cancelada'
      AND ot.tecnico_asignado_id IS NOT NULL
      AND (ot.negocio_id = 1 OR ot.negocio_id IS NULL)
    `;

    const fullWhere = `${baseWhere}${fechaWhere.where}`;
    const allParams = [...fechaWhere.params];

    // Get services for orders
    let serviciosJoin = '';
    let serviciosCols = '';
    try {
      const soCols = await getColumnas(env, 'ServiciosOrden');
      if (soCols.length > 0) {
        serviciosJoin = `
          LEFT JOIN ServiciosOrden so ON so.orden_id = ot.id
        `;
        serviciosCols = `
          COALESCE(so.precio, 0) as servicio_precio,
          so.nombre_servicio as servicio_nombre,
          COALESCE(so.categoria, '') as servicio_categoria,
        `;
      }
    } catch (e) {
      // ServiciosOrden table may not exist
    }

    // Get orders with services in period
    let query = `
      SELECT
        ot.id,
        ot.numero_orden,
        ot.patente_placa as patente,
        ot.estado,
        ot.estado_trabajo,
        COALESCE(ot.monto_final, ot.monto_base, ot.monto_total, 0) as monto_total,
        COALESCE(ot.monto_abono, ot.abono, 0) as monto_abono,
        ot.fecha_creacion,
        ot.fecha_completado,
        ot.tecnico_asignado_id,
        t.nombre as tecnico_nombre,
        t.comision_porcentaje,
        ${serviciosCols}
        COALESCE((
          SELECT SUM(ca.monto) FROM CostosAdicionales ca WHERE ca.orden_id = ot.id
          ${costosCols.includes('categoria') ? "AND ca.categoria IN ('repuestos', 'insumos', 'Repuestos', 'Insumos')" : ''}
        ), 0) as costo_repuestos,
        COALESCE((
          SELECT SUM(ca.monto) FROM CostosAdicionales ca WHERE ca.orden_id = ot.id
          ${costosCols.includes('categoria') ? "AND ca.categoria IN ('mano_obra', 'Mano de Obra', 'Mano de obra')" : ''}
        ), 0) as costo_mano_obra
      FROM OrdenesTrabajo ot
      JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
      ${serviciosJoin}
      WHERE ${fullWhere}
    `;

    if (tecnicoId) {
      query += ` AND ot.tecnico_asignado_id = ?`;
      allParams.push(tecnicoId);
    }

    query += ` ORDER BY t.nombre ASC, ot.fecha_creacion DESC`;

    const result = await env.DB.prepare(query).bind(...allParams).all();
    const ordenes = result.results || [];

    // If there are ServiciosOrden rows, we might have duplicates; dedupe by order id
    const ordenesMap = new Map();
    for (const row of ordenes) {
      const existing = ordenesMap.get(row.id);
      if (existing) {
        // Aggregate service prices for mano_obra type
        const servCat = (row.servicio_categoria || '').toLowerCase();
        if (servCat === 'mano_obra' || !existing._hasServicios) {
          existing.base_comisionable = (existing.base_comisionable || 0) + (parseFloat(row.servicio_precio) || 0);
          existing._hasServicios = true;
        }
      } else {
        // Determine base_comisionable:
        // Services priced as mano_obra, or costo_mano_obra from CostosAdicionales, or monto_total as fallback
        let baseComisionable = row.costo_mano_obra || 0;
        const servCat = (row.servicio_categoria || '').toLowerCase();
        if (row.servicio_precio && (servCat === 'mano_obra' || servCat === '')) {
          baseComisionable = (baseComisionable || 0) + parseFloat(row.servicio_precio);
        }
        if (baseComisionable === 0) {
          // Fallback: use monto_total minus repuestos
          baseComisionable = Math.max(0, (row.monto_total || 0) - (row.costo_repuestos || 0));
        }
        ordenesMap.set(row.id, {
          ...row,
          base_comisionable: baseComisionable,
          _hasServicios: !!row.servicio_precio,
        });
      }
    }

    // Group by technician
    const tecnicosMap = new Map();

    for (const orden of ordenesMap.values()) {
      const tecId = orden.tecnico_asignado_id;
      if (!tecnicosMap.has(tecId)) {
        tecnicosMap.set(tecId, {
          tecnico_id: tecId,
          tecnico_nombre: orden.tecnico_nombre,
          comision_porcentaje: orden.comision_porcentaje || 10,
          ordenes: [],
          total_base_comisionable: 0,
          total_ganancia: 0,
          total_facturado: 0,
          cantidad_ordenes: 0,
        });
      }

      const tec = tecnicosMap.get(tecId);
      const comision = orden.comision_porcentaje || 10;
      const ganancia = Math.round((orden.base_comisionable || 0) * (comision / 100));

      tec.ordenes.push({
        orden_id: orden.id,
        numero_orden: orden.numero_orden,
        patente: orden.patente,
        estado: orden.estado,
        fecha_creacion: orden.fecha_creacion,
        monto_total: orden.monto_total,
        monto_abono: orden.monto_abono,
        base_comisionable: orden.base_comisionable,
        porcentaje_comision: comision,
        ganancia: ganancia,
        costo_repuestos: orden.costo_repuestos,
        costo_mano_obra: orden.costo_mano_obra,
      });

      tec.total_base_comisionable += orden.base_comisionable || 0;
      tec.total_ganancia += ganancia;
      tec.total_facturado += orden.monto_total || 0;
      tec.cantidad_ordenes += 1;
    }

    const tecnicos = Array.from(tecnicosMap.values());

    // Grand totals
    const granTotal = tecnicos.reduce((acc, t) => ({
      total_base_comisionable: acc.total_base_comisionable + t.total_base_comisionable,
      total_ganancia: acc.total_ganancia + t.total_ganancia,
      total_facturado: acc.total_facturado + t.total_facturado,
      cantidad_ordenes: acc.cantidad_ordenes + t.cantidad_ordenes,
    }), { total_base_comisionable: 0, total_ganancia: 0, total_facturado: 0, cantidad_ordenes: 0 });

    return successRes({
      periodo: { tipo: periodo, valor },
      tecnicos,
      resumen: granTotal,
    });
  } catch (error) {
    console.error('Liquidar técnicos error:', error);
    return errorRes('Error calculando liquidación: ' + error.message, 500);
  }
}
