// ============================================================
// BizFlow - Catálogo de Servicios CRUD API
// GET: list active services (or all if ?todas=true)
// POST: create service
// PUT: update service
// DELETE: hard delete by id
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

// GET - List services
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const todas = url.searchParams.get('todas') === 'true';
  const categoria = url.searchParams.get('categoria');

  try {
    await asegurarColumnasFaltantes(env);

    let query = `SELECT * FROM ServiciosCatalogo WHERE 1=1`;
    const params = [];

    if (!todas) {
      query += ` AND activo = 1`;
    }
    if (categoria) {
      query += ` AND categoria = ?`;
      params.push(categoria);
    }

    query += ` ORDER BY categoria ASC, nombre ASC`;

    const result = await env.DB.prepare(query).bind(...params).all();
    return successRes(result.results || []);
  } catch (error) {
    console.error('Servicios list error:', error);
    return errorRes('Error listando servicios: ' + error.message, 500);
  }
}

// POST - Create service
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { nombre, precio_sugerido, categoria, tipo_comision, descripcion } = data;

  const validation = validateRequired(data, ['nombre']);
  if (!validation.valid) {
    return errorRes(`Campos requeridos faltantes: ${validation.missing.join(', ')}`);
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Check unique name
    const existing = await env.DB.prepare(
      `SELECT id FROM ServiciosCatalogo WHERE nombre = ? LIMIT 1`
    ).bind(nombre.trim()).first();

    if (existing) {
      return errorRes('Ya existe un servicio con ese nombre');
    }

    const result = await env.DB.prepare(`
      INSERT INTO ServiciosCatalogo (nombre, precio_sugerido, categoria, tipo_comision, descripcion, activo, negocio_id, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 1, ?)
    `).bind(
      nombre.trim(),
      parseFloat(precio_sugerido) || 0,
      categoria?.trim() || 'general',
      tipo_comision?.trim() || 'mano_obra',
      descripcion?.trim() || null,
      chileNowISO()
    ).run();

    const servicio = await env.DB.prepare(
      `SELECT * FROM ServiciosCatalogo WHERE id = ?`
    ).bind(result.meta.last_row_id).first();

    return successRes(servicio, 201);
  } catch (error) {
    console.error('Servicio create error:', error);
    return errorRes('Error creando servicio: ' + error.message, 500);
  }
}

// PUT - Update service
export async function onRequestPut(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { id, nombre, precio_sugerido, categoria, tipo_comision, descripcion, activo } = data;

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    const existing = await env.DB.prepare(
      `SELECT id FROM ServiciosCatalogo WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Servicio no encontrado', 404);
    }

    // Check unique name if changing
    if (nombre && nombre.trim()) {
      const dup = await env.DB.prepare(
        `SELECT id FROM ServiciosCatalogo WHERE nombre = ? AND id != ? LIMIT 1`
      ).bind(nombre.trim(), id).first();
      if (dup) {
        return errorRes('Ya existe un servicio con ese nombre');
      }
    }

    const updates = [];
    const params = [];

    if (nombre !== undefined) { updates.push('nombre = ?'); params.push(nombre.trim()); }
    if (precio_sugerido !== undefined) { updates.push('precio_sugerido = ?'); params.push(parseFloat(precio_sugerido) || 0); }
    if (categoria !== undefined) { updates.push('categoria = ?'); params.push(categoria?.trim() || 'general'); }
    if (tipo_comision !== undefined) { updates.push('tipo_comision = ?'); params.push(tipo_comision?.trim() || 'mano_obra'); }
    if (descripcion !== undefined) { updates.push('descripcion = ?'); params.push(descripcion?.trim() || null); }
    if (activo !== undefined) { updates.push('activo = ?'); params.push(activo ? 1 : 0); }

    if (updates.length === 0) {
      return errorRes('No hay campos para actualizar');
    }

    params.push(id);

    await env.DB.prepare(
      `UPDATE ServiciosCatalogo SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    const servicio = await env.DB.prepare(
      `SELECT * FROM ServiciosCatalogo WHERE id = ?`
    ).bind(id).first();

    return successRes(servicio);
  } catch (error) {
    console.error('Servicio update error:', error);
    return errorRes('Error actualizando servicio: ' + error.message, 500);
  }
}

// DELETE - Hard delete service
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM ServiciosCatalogo WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Servicio no encontrado', 404);
    }

    await env.DB.prepare(`DELETE FROM ServiciosCatalogo WHERE id = ?`).bind(id).run();

    return successRes({ deleted: true, id: parseInt(id) });
  } catch (error) {
    console.error('Servicio delete error:', error);
    return errorRes('Error eliminando servicio: ' + error.message, 500);
  }
}
