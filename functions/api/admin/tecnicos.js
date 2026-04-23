// ============================================================
// BizFlow - Tecnicos CRUD API
// GET: List all tecnicos | POST: Create | PUT: Update | DELETE: Delete
// ============================================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  asegurarColumnasFaltantes,
  simpleHash,
  chileNowISO,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

// GET - List all tecnicos
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const negocioId = url.searchParams.get('negocio_id') || '1';
  const incluirInactivos = url.searchParams.get('incluir_inactivos') === 'true';

  try {
    await asegurarColumnasFaltantes(env);

    let query = `
      SELECT
        t.*,
        COUNT(ot.id) as total_ordenes,
        SUM(CASE WHEN ot.estado = 'Cerrada' OR ot.estado = 'cerrada' THEN 1 ELSE 0 END) as ordenes_cerradas,
        COALESCE(SUM(CASE WHEN ot.estado != 'Cancelada' AND ot.estado != 'Eliminada'
          THEN COALESCE(ot.monto_final, ot.monto_base, 0) ELSE 0 END), 0) as total_facturado
      FROM Tecnicos t
      LEFT JOIN OrdenesTrabajo ot ON ot.tecnico_asignado_id = t.id
      WHERE (t.negocio_id = ? OR t.negocio_id IS NULL)
    `;
    const params = [negocioId];

    if (!incluirInactivos) {
      query += ` AND t.activo = 1`;
    }

    query += ` GROUP BY t.id ORDER BY t.nombre ASC`;

    const result = await env.DB.prepare(query).bind(...params).all();

    return successRes(result.results || []);
  } catch (error) {
    console.error('Tecnicos list error:', error);
    return errorRes('Error listando técnicos: ' + error.message, 500);
  }
}

// POST - Create tecnico
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { nombre, telefono, email, pin, comision_porcentaje, negocio_id } = data;

  // Validate required fields
  if (!nombre || !nombre.trim()) {
    return errorRes('Nombre es requerido');
  }
  if (!telefono || !telefono.trim()) {
    return errorRes('Teléfono es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Check unique telefono
    const existing = await env.DB.prepare(
      `SELECT id FROM Tecnicos WHERE telefono = ? AND (negocio_id = ? OR negocio_id IS NULL) LIMIT 1`
    ).bind(telefono.trim(), negocio_id || 1).first();

    if (existing) {
      return errorRes('Ya existe un técnico con ese teléfono');
    }

    const hashedPin = pin ? simpleHash(pin.trim()) : null;
    const comision = parseFloat(comision_porcentaje) || 10;
    const now = chileNowISO();

    const result = await env.DB.prepare(`
      INSERT INTO Tecnicos (nombre, telefono, email, pin, comision_porcentaje, activo, negocio_id, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      nombre.trim(),
      telefono.trim(),
      email?.trim() || null,
      hashedPin,
      comision,
      negocio_id || 1,
      now
    ).run();

    const tecnico = await env.DB.prepare(
      `SELECT * FROM Tecnicos WHERE id = ?`
    ).bind(result.meta.last_row_id).first();

    return successRes(tecnico, 201);
  } catch (error) {
    console.error('Tecnico create error:', error);
    return errorRes('Error creando técnico: ' + error.message, 500);
  }
}

// PUT - Update tecnico
export async function onRequestPut(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { id, nombre, telefono, email, pin, comision_porcentaje, activo } = data;

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Check if tecnico exists
    const existing = await env.DB.prepare(
      `SELECT id, telefono FROM Tecnicos WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Técnico no encontrado', 404);
    }

    // Check unique telefono if changing
    if (telefono && telefono.trim() !== existing.telefono) {
      const dup = await env.DB.prepare(
        `SELECT id FROM Tecnicos WHERE telefono = ? AND id != ? LIMIT 1`
      ).bind(telefono.trim(), id).first();
      if (dup) {
        return errorRes('Ya existe un técnico con ese teléfono');
      }
    }

    // Build update fields
    const updates = [];
    const params = [];

    if (nombre !== undefined) { updates.push('nombre = ?'); params.push(nombre.trim()); }
    if (telefono !== undefined) { updates.push('telefono = ?'); params.push(telefono.trim()); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email?.trim() || null); }
    if (pin !== undefined) { updates.push('pin = ?'); params.push(pin ? simpleHash(pin.trim()) : null); }
    if (comision_porcentaje !== undefined) { updates.push('comision_porcentaje = ?'); params.push(parseFloat(comision_porcentaje) || 10); }
    if (activo !== undefined) { updates.push('activo = ?'); params.push(activo ? 1 : 0); }

    if (updates.length === 0) {
      return errorRes('No hay campos para actualizar');
    }

    updates.push('updated_at = ?');
    params.push(chileNowISO());
    params.push(id);

    await env.DB.prepare(
      `UPDATE Tecnicos SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    const tecnico = await env.DB.prepare(
      `SELECT * FROM Tecnicos WHERE id = ?`
    ).bind(id).first();

    return successRes(tecnico);
  } catch (error) {
    console.error('Tecnico update error:', error);
    return errorRes('Error actualizando técnico: ' + error.message, 500);
  }
}

// DELETE - Delete tecnico
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM Tecnicos WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Técnico no encontrado', 404);
    }

    // Check for assigned orders
    const assignedOrders = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM OrdenesTrabajo WHERE tecnico_asignado_id = ? AND estado NOT IN ('Cerrada', 'cerrada', 'Cancelada', 'Eliminada')`
    ).bind(id).first();

    if (assignedOrders && assignedOrders.count > 0) {
      return errorRes(`No se puede eliminar: el técnico tiene ${assignedOrders.count} ordenes activas asignadas`);
    }

    await env.DB.prepare(`DELETE FROM Tecnicos WHERE id = ?`).bind(id).run();

    return successRes({ deleted: true, id: parseInt(id) });
  } catch (error) {
    console.error('Tecnico delete error:', error);
    return errorRes('Error eliminando técnico: ' + error.message, 500);
  }
}
