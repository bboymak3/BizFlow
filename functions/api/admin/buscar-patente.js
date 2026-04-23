// ============================================================
// BizFlow - Buscar Patente (Search by License Plate) API
// GET: Search vehicles by patente prefix with client data
// ============================================================

import {
  corsHeaders,
  handleOptions,
  successRes,
  errorRes,
  asegurarColumnasFaltantes,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const patente = url.searchParams.get('patente');
  const negocioId = url.searchParams.get('negocio_id') || '1';

  if (!patente || patente.trim().length < 2) {
    return errorRes('Patente debe tener al menos 2 caracteres');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Normalize patente (uppercase, no spaces)
    const patenteNorm = patente.trim().toUpperCase().replace(/\s/g, '') + '%';

    // Search vehicles with client data and recent orders
    const result = await env.DB.prepare(`
      SELECT
        v.*,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        c.email as cliente_email,
        c.direccion as cliente_direccion,
        (SELECT COUNT(*) FROM OrdenesTrabajo ot
         WHERE ot.patente = v.patente
         AND (ot.negocio_id = ? OR ot.negocio_id IS NULL)
         AND ot.estado != 'Eliminada') as total_ordenes,
        (SELECT MAX(ot.fecha_creacion) FROM OrdenesTrabajo ot
         WHERE ot.patente = v.patente
         AND (ot.negocio_id = ? OR ot.negocio_id IS NULL)
         AND ot.estado != 'Eliminada') as ultima_orden
      FROM Vehiculos v
      LEFT JOIN Clientes c ON v.cliente_id = c.id
      WHERE v.patente LIKE ?
      AND (v.negocio_id = ? OR v.negocio_id IS NULL)
      ORDER BY v.patente ASC
      LIMIT 20
    `).bind(negocioId, negocioId, patenteNorm, negocioId).all();

    const vehiculos = result.results || [];

    // Also search directly in orders for patentes not yet in vehicles table
    const ordenResult = await env.DB.prepare(`
      SELECT DISTINCT
        ot.patente,
        ot.cliente_nombre,
        ot.cliente_telefono,
        ot.marca,
        ot.modelo,
        MAX(ot.fecha_creacion) as ultima_orden,
        COUNT(*) as total_ordenes
      FROM OrdenesTrabajo ot
      WHERE ot.patente LIKE ?
      AND (ot.negocio_id = ? OR ot.negocio_id IS NULL)
      AND ot.estado != 'Eliminada'
      AND ot.patente NOT IN (SELECT patente FROM Vehiculos WHERE patente LIKE ?)
      GROUP BY ot.patente, ot.cliente_nombre, ot.cliente_telefono, ot.marca, ot.modelo
      ORDER BY ultima_orden DESC
      LIMIT 10
    `).bind(patenteNorm, negocioId, patenteNorm).all();

    const fromOrders = (ordenResult.results || []).map(o => ({
      patente: o.patente,
      marca: o.marca,
      modelo: o.modelo,
      cliente_nombre: o.cliente_nombre,
      cliente_telefono: o.cliente_telefono,
      total_ordenes: o.total_ordenes,
      ultima_orden: o.ultima_orden,
      source: 'orders',
    }));

    return successRes({
      vehiculos,
      from_orders: fromOrders,
      total: vehiculos.length + fromOrders.length,
    });
  } catch (error) {
    console.error('Buscar patente error:', error);
    return errorRes('Error buscando patente: ' + error.message, 500);
  }
}
