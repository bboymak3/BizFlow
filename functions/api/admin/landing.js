// ============================================================
// BizFlow - Landing Pages CRUD API
// GET: list landing pages for negocio_id
// POST: create landing page
// PUT: update landing page { id, ...fields, publicado }
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
  getColumnas,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

// GET - List landing pages
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const negocioId = url.searchParams.get('negocio_id') || '1';
  const publicadas = url.searchParams.get('publicadas') === 'true';
  const slug = url.searchParams.get('slug');

  try {
    await asegurarColumnasFaltantes(env);
    const cols = await getColumnas(env, 'LandingPages');

    let query = `SELECT * FROM LandingPages WHERE 1=1`;
    const params = [];

    if (slug) {
      query += ` AND slug = ?`;
      params.push(slug);
    } else {
      query += ` AND (negocio_id = ? OR negocio_id IS NULL)`;
      params.push(negocioId);
    }

    if (publicadas) {
      query += cols.includes('publicado')
        ? ` AND publicado = 1`
        : ` AND activa = 1`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await env.DB.prepare(query).bind(...params).all();

    return successRes(result.results || []);
  } catch (error) {
    console.error('Landing pages list error:', error);
    return errorRes('Error listando landing pages: ' + error.message, 500);
  }
}

// POST - Create landing page
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const {
    titulo, slug, descripcion, contenido, secciones, colores,
    meta_title, meta_description, logo_url, favicon_url, negocio_id,
  } = data;

  const validation = validateRequired(data, ['titulo', 'slug']);
  if (!validation.valid) {
    return errorRes(`Campos requeridos faltantes: ${validation.missing.join(', ')}`);
  }

  // Validate slug format
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return errorRes('Slug inválido. Use solo letras minúsculas, números y guiones.');
  }

  try {
    await asegurarColumnasFaltantes(env);
    const cols = await getColumnas(env, 'LandingPages');

    // Check unique slug
    const existing = await env.DB.prepare(
      `SELECT id FROM LandingPages WHERE slug = ? LIMIT 1`
    ).bind(slug.trim()).first();

    if (existing) {
      return errorRes('Ya existe una landing page con ese slug');
    }

    // Build insert based on available columns
    const insertFields = ['titulo', 'slug', 'negocio_id', 'created_at'];
    const insertParams = [titulo.trim(), slug.trim(), negocio_id || '1', chileNowISO()];

    const optionalFields = [
      { key: 'descripcion', value: descripcion?.trim() || null },
      { key: 'contenido', value: contenido || null },
      { key: 'secciones', value: secciones ? JSON.stringify(secciones) : null },
      { key: 'colores', value: colores ? JSON.stringify(colores) : null },
      { key: 'meta_title', value: meta_title?.trim() || null },
      { key: 'meta_description', value: meta_description?.trim() || null },
      { key: 'logo_url', value: logo_url?.trim() || null },
      { key: 'favicon_url', value: favicon_url?.trim() || null },
    ];

    for (const { key, value } of optionalFields) {
      if (value !== null && cols.includes(key)) {
        insertFields.push(key);
        insertParams.push(value);
      }
    }

    if (cols.includes('fecha_actualizacion')) {
      insertFields.push('fecha_actualizacion');
      insertParams.push(chileNowISO());
    }

    const placeholders = insertFields.map(() => '?').join(', ');
    const result = await env.DB.prepare(`
      INSERT INTO LandingPages (${insertFields.join(', ')})
      VALUES (${placeholders})
    `).bind(...insertParams).run();

    const landing = await env.DB.prepare(
      `SELECT * FROM LandingPages WHERE id = ?`
    ).bind(result.meta.last_row_id).first();

    return successRes(landing, 201);
  } catch (error) {
    console.error('Landing page create error:', error);
    return errorRes('Error creando landing page: ' + error.message, 500);
  }
}

// PUT - Update landing page
export async function onRequestPut(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { id, ...fields } = data;

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);
    const cols = await getColumnas(env, 'LandingPages');

    const existing = await env.DB.prepare(
      `SELECT id, slug FROM LandingPages WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Landing page no encontrada', 404);
    }

    // Check unique slug if changing
    if (fields.slug && fields.slug.trim() !== existing.slug) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug)) {
        return errorRes('Slug inválido. Use solo letras minúsculas, números y guiones.');
      }
      const dup = await env.DB.prepare(
        `SELECT id FROM LandingPages WHERE slug = ? AND id != ? LIMIT 1`
      ).bind(fields.slug.trim(), id).first();
      if (dup) {
        return errorRes('Ya existe una landing page con ese slug');
      }
    }

    const allowedFields = [
      'titulo', 'slug', 'descripcion', 'contenido', 'secciones',
      'colores', 'meta_title', 'meta_description', 'logo_url',
      'favicon_url', 'publicado', 'activa', 'visitas',
    ];

    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(fields)) {
      if (!allowedFields.includes(key)) continue;
      if (!cols.includes(key)) continue;

      // JSON.stringify object fields
      const jsonFields = ['secciones', 'colores'];
      const finalValue = jsonFields.includes(key) && typeof value === 'object'
        ? JSON.stringify(value)
        : (value?.trim?.() || value);

      updates.push(`${key} = ?`);
      params.push(finalValue);
    }

    if (updates.length === 0) {
      return errorRes('No hay campos para actualizar');
    }

    // Always update fecha_actualizacion
    if (cols.includes('fecha_actualizacion')) {
      updates.push('fecha_actualizacion = ?');
      params.push(chileNowISO());
    }
    if (cols.includes('updated_at')) {
      updates.push('updated_at = ?');
      params.push(chileNowISO());
    }

    params.push(id);

    await env.DB.prepare(
      `UPDATE LandingPages SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    const landing = await env.DB.prepare(
      `SELECT * FROM LandingPages WHERE id = ?`
    ).bind(id).first();

    return successRes(landing);
  } catch (error) {
    console.error('Landing page update error:', error);
    return errorRes('Error actualizando landing page: ' + error.message, 500);
  }
}

// DELETE - Delete landing page
export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorRes('ID es requerido');
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM LandingPages WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return errorRes('Landing page no encontrada', 404);
    }

    await env.DB.prepare(`DELETE FROM LandingPages WHERE id = ?`).bind(id).run();

    return successRes({ deleted: true, id: parseInt(id) });
  } catch (error) {
    console.error('Landing page delete error:', error);
    return errorRes('Error eliminando landing page: ' + error.message, 500);
  }
}
