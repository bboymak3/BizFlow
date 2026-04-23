// ============================================================
// BizFlow - Buscar Órdenes API
// GET: Search orders by ?patente=XXX (prefix search)
// Return up to 20 results with full cost breakdown
// Join Clientes and Tecnicos
// ============================================================

import {
  handleOptions,
  successRes,
  errorRes,
  asegurarColumnasFaltantes,
  getColumnas,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const patente = (url.searchParams.get('patente') || '').trim().toUpperCase();
  const numero = url.searchParams.get('numero');
  const cliente = (url.searchParams.get('cliente') || '').trim().toLowerCase();
  const estado = url.searchParams.get('estado');
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 50);

  if (!patente && !numero && !cliente) {
    return errorRes('Se requiere al menos un filtro: patente, numero o cliente');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Check for CostosAdicionales and ServiciosOrden tables
    const costosCols = await getColumnas(env, 'CostosAdicionales');
    let hasCostos = costosCols.length > 0;

    let hasServiciosOrden = false;
    try {
      const soCols = await getColumnas(env, 'ServiciosOrden');
      hasServiciosOrden = soCols.length > 0;
    } catch (e) {
      // Table doesn't exist
    }

    let query = `
      SELECT
        ot.*,
        c.id as cliente_id,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        c.email as cliente_email,
        c.direccion as cliente_direccion,
        t.id as tecnico_id,
        t.nombre as tecnico_nombre,
        t.telefono as tecnico_telefono,
        t.comision_porcentaje
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
      WHERE ot.estado != 'Eliminada'
    `;
    const params = [];

    // Add filters
    if (patente) {
      query += ` AND UPPER(ot.patente_placa) LIKE ?`;
      params.push(`${patente}%`);
    }
    if (numero) {
      query += ` AND ot.numero_orden = ?`;
      params.push(parseInt(numero));
    }
    if (cliente) {
      query += ` AND (LOWER(c.nombre) LIKE ? OR LOWER(c.telefono) LIKE ? OR LOWER(ot.cliente_nombre) LIKE ?)`;
      const clientePattern = `%${cliente}%`;
      params.push(clientePattern, clientePattern, clientePattern);
    }
    if (estado) {
      query += ` AND ot.estado = ?`;
      params.push(estado);
    }

    query += ` ORDER BY ot.fecha_creacion DESC LIMIT ?`;
    params.push(limit);

    const result = await env.DB.prepare(query).bind(...params).all();
    const ordenes = result.results || [];

    // If no results found, return empty
    if (ordenes.length === 0) {
      return successRes({ ordenes: [], total: 0 });
    }

    // Enrich with cost breakdown for each order
    const ordenIds = ordenes.map(o => o.id);

    let costosMap = {};
    if (hasCostos) {
      // Batch query for all costs
      const placeholders = ordenIds.map(() => '?').join(',');
      const costosResult = await env.DB.prepare(`
        SELECT * FROM CostosAdicionales
        WHERE orden_id IN (${placeholders})
        ORDER BY created_at DESC
      `).bind(...ordenIds).all();

      for (const costo of (costosResult.results || [])) {
        if (!costosMap[costo.orden_id]) costosMap[costo.orden_id] = [];
        costosMap[costo.orden_id].push(costo);
      }
    }

    let serviciosMap = {};
    if (hasServiciosOrden) {
      const placeholders = ordenIds.map(() => '?').join(',');
      const servResult = await env.DB.prepare(`
        SELECT * FROM ServiciosOrden
        WHERE orden_id IN (${placeholders})
        ORDER BY id ASC
      `).bind(...ordenIds).all().catch(() => ({ results: [] }));

      for (const serv of (servResult.results || [])) {
        if (!serviciosMap[serv.orden_id]) serviciosMap[serv.orden_id] = [];
        serviciosMap[serv.orden_id].push(serv);
      }
    }

    // Build enriched response
    const enrichedOrdenes = ordenes.map(orden => {
      const costos = costosMap[orden.id] || [];
      const servicios = serviciosMap[orden.id] || [];
      const totalCostosAdicionales = costos.reduce((sum, c) => sum + (c.monto || 0), 0);
      const totalServicios = servicios.reduce((sum, s) => sum + (s.precio || 0), 0);

      return {
        ...orden,
        costos_adicionales: costos,
        servicios: servicios,
        total_costos_adicionales: totalCostosAdicionales,
        total_servicios: totalServicios,
        monto_calculado: (orden.monto_final || orden.monto_base || orden.monto_total || 0) + totalCostosAdicionales,
      };
    });

    return successRes({
      ordenes: enrichedOrdenes,
      total: enrichedOrdenes.length,
      filtros_aplicados: { patente: patente || null, numero: numero || null, cliente: cliente || null, estado: estado || null },
    });
  } catch (error) {
    console.error('Buscar órdenes error:', error);
    return errorRes('Error buscando órdenes: ' + error.message, 500);
  }
}
