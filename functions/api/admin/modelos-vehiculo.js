// ============================================================
// BizFlow - Modelos de Vehículo CRUD API
// GET: list all modelos
// POST: create modelo { nombre }
// DELETE: delete by ?id
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

// GET - List all modelos
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const busqueda = url.searchParams.get('q');

  try {
    await asegurarColumnasFaltantes(env);

    let query = `SELECT * FROM ModelosVehiculo WHERE 1=1`;
    const params = [];

    if (busqueda) {
      query += ` AND nombre LIKE ?`;
      params.push(`%${busqueda}%`);
    }

    query += ` ORDER BY nombre ASC`;

    const result = await env.DB.prepare(query).bind(...params).all();

    return successRes(result.results || []);
  } catch (error) {
    console.error('Modelos list error:', error);
    return errorRes('Error listando modelos: ' + error.message, 500);
  }
}

// POST - Create modelo
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { nombre, marca, modelo } = data;

  const validation = validateRequired(data, ['nombre']);
  if (!validation.valid) {
    return errorRes(`Campo requerido faltante: ${validation.missing.join(', ')}`);
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Check for duplicate
    const existing = await env.DB.prepare(
      `SELECT id FROM ModelosVehiculo WHERE nombre = ? LIMIT 1`
    ).bind(nombre.trim()).first();

    if (existing) {
      return errorRes('Ya existe un modelo con ese nombre');
    }

    const result = await env.DB.prepare(`
      INSERT INTO ModelosVehiculo (nombre, marca, modelo, negocio_id, created_at)
      VALUES (?, ?, ?, 1, ?)
    `).bind(
      nombre.trim(),
      marca?.trim() || null,
      modelo?.trim() || null,
      chileNowISO()
    ).run();

    const newModelo = await env.DB.prepare(
      `SELECT * FROM ModelosVehiculo WHERE id = ?`
    ).bind(result.meta.last_row_id).first();

    return successRes(newModelo, 201);
  } catch (error) {
    console.error('Modelo create error:', error);
    return errorRes('Error creando modelo: ' + error.message, 500);
  }
}

// DELETE - Delete modelo
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM ModelosVehiculo WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Modelo no encontrado', 404);
    }

    await env.DB.prepare(`DELETE FROM ModelosVehiculo WHERE id = ?`).bind(id).run();

    return successRes({ deleted: true, id: parseInt(id) });
  } catch (error) {
    console.error('Modelo delete error:', error);
    return errorRes('Error eliminando modelo: ' + error.message, 500);
  }
}
