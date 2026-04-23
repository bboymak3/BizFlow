// ============================================================
// BizFlow - Costos Adicionales API
// GET: list costs for ?orden_id
// POST: add cost { orden_id, concepto, monto, categoria }
// DELETE: remove by id
// ============================================================

import {
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  chileNowISO,
  asegurarColumnasFaltantes,
  validateRequired,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

// GET - List costs for an order
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const ordenId = url.searchParams.get('orden_id');

  if (!ordenId) {
    return errorRes('orden_id es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    const costs = await env.DB.prepare(`
      SELECT * FROM CostosAdicionales
      WHERE orden_id = ?
      ORDER BY created_at DESC
    `).bind(ordenId).all();

    // Get total
    const total = await env.DB.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total FROM CostosAdicionales WHERE orden_id = ?
    `).bind(ordenId).first();

    return successRes({
      costos: costs.results || [],
      total: total?.total || 0,
    });
  } catch (error) {
    console.error('Costos adicionales list error:', error);
    return errorRes('Error obteniendo costos: ' + error.message, 500);
  }
}

// POST - Add cost to order
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { orden_id, concepto, monto, categoria, registrado_por } = data;

  const validation = validateRequired(data, ['orden_id', 'concepto', 'monto']);
  if (!validation.valid) {
    return errorRes(`Campos requeridos faltantes: ${validation.missing.join(', ')}`);
  }

  const montoNum = parseFloat(monto);
  if (isNaN(montoNum) || montoNum < 0) {
    return errorRes('Monto debe ser un número positivo');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Verify order exists
    const orden = await env.DB.prepare(
      `SELECT id, estado, estado_trabajo FROM OrdenesTrabajo WHERE id = ?`
    ).bind(orden_id).first();

    if (!orden) {
      return errorRes('Orden no encontrada', 404);
    }

    // Reject if order is closed/cancelled/deleted
    const estadosCerrados = ['Cerrada', 'cerrada', 'Cancelada', 'Eliminada'];
    if (estadosCerrados.includes(orden.estado)) {
      return errorRes(`No se pueden agregar costos a una orden en estado "${orden.estado}"`);
    }

    const result = await env.DB.prepare(`
      INSERT INTO CostosAdicionales (orden_id, concepto, monto, categoria, registrado_por, negocio_id, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).bind(
      orden_id,
      concepto.trim(),
      montoNum,
      categoria?.trim() || 'Mano de Obra',
      registrado_por || null,
      chileNowISO()
    ).run();

    const costo = await env.DB.prepare(
      `SELECT * FROM CostosAdicionales WHERE id = ?`
    ).bind(result.meta.last_row_id).first();

    return successRes(costo, 201);
  } catch (error) {
    console.error('Costo adicional create error:', error);
    return errorRes('Error agregando costo: ' + error.message, 500);
  }
}

// DELETE - Remove cost by id
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    const costo = await env.DB.prepare(
      `SELECT ca.*, ot.estado as orden_estado
       FROM CostosAdicionales ca
       JOIN OrdenesTrabajo ot ON ca.orden_id = ot.id
       WHERE ca.id = ?`
    ).bind(id).first();

    if (!costo) {
      return errorRes('Costo no encontrado', 404);
    }

    // Reject if order is closed
    const estadosCerrados = ['Cerrada', 'cerrada', 'Cancelada', 'Eliminada'];
    if (estadosCerrados.includes(costo.orden_estado)) {
      return errorRes('No se pueden eliminar costos de una orden cerrada');
    }

    await env.DB.prepare(`DELETE FROM CostosAdicionales WHERE id = ?`).bind(id).run();

    return successRes({ deleted: true, id: parseInt(id) });
  } catch (error) {
    console.error('Costo adicional delete error:', error);
    return errorRes('Error eliminando costo: ' + error.message, 500);
  }
}
