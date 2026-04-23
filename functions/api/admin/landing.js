// ============================================================
// BizFlow - Landing Pages CRUD API (con R2)
// GET: list landing pages
// POST: create landing page
// PUT: update landing page
// DELETE: delete by ?id
// POST /api/landing/upload: upload media to R2 for landing page
// ============================================================

import {
  jsonResponse, errorResponse, handleCors, hoyISO, getUserIdFromRequest,
} from '../../lib/db-helpers.js';
import { subirArchivoR2, generarRutaLanding, base64ToArrayBuffer } from '../../lib/r2-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;

  if (request.method === 'GET') {
    return await handleGet(env, request);
  } else if (request.method === 'POST') {
    // Check if it's a media upload or a landing page creation
    const url = new URL(request.url);
    if (url.searchParams.get('action') === 'upload' || url.pathname.endsWith('/upload')) {
      return await handleUploadMedia(env, request);
    }
    return await handlePost(env, request);
  } else if (request.method === 'PUT') {
    return await handlePut(env, request);
  } else if (request.method === 'DELETE') {
    return await handleDelete(env, request);
  } else {
    return errorResponse('Método no permitido', 405);
  }
}

// ─────────────────────────────────────────────
// GET - List landing pages
// ─────────────────────────────────────────────
async function handleGet(env, request) {
  const url = new URL(request.url);
  const usuarioId = url.searchParams.get('usuario_id');
  const publicada = url.searchParams.get('publicada') === 'true';
  const slug = url.searchParams.get('slug');

  try {
    let query = 'SELECT * FROM LandingPages WHERE 1=1';
    const params = [];

    if (slug) {
      query += ' AND slug = ?';
      params.push(slug);
    } else if (usuarioId) {
      query += ' AND usuario_id = ?';
      params.push(parseInt(usuarioId));
    }

    if (publicada) {
      query += ' AND publica = 1';
    }

    query += ' ORDER BY creado_en DESC';

    const result = await env.DB.prepare(query).bind(...params).all();

    return jsonResponse({
      landing_pages: result.results || [],
      total: (result.results || []).length,
    });

  } catch (error) {
    return errorResponse('Error listando landing pages: ' + error.message, 500);
  }
}

// ─────────────────────────────────────────────
// POST - Create landing page
// ─────────────────────────────────────────────
async function handlePost(env, request) {
  try {
    const body = await request.json();
    const {
      titulo, slug, descripcion, contenido_json, html_personalizado,
      css_personalizado, color_principal, color_secundario, fuente,
      formulario_activo, campos_formulario, boton_cta_texto, boton_cta_url,
      seo_titulo, seo_descripcion, seo_keywords,
    } = body;

    if (!titulo || !slug) {
      return errorResponse('Campos obligatorios: titulo, slug');
    }

    // Validate slug format
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return errorResponse('Slug inválido. Use solo letras minúsculas, números y guiones.');
    }

    // Check unique slug
    const existing = await env.DB.prepare(
      'SELECT id FROM LandingPages WHERE slug = ? LIMIT 1'
    ).bind(slug.trim()).first();

    if (existing) {
      return errorResponse('Ya existe una landing page con ese slug');
    }

    const userId = await getUserIdFromRequest(request, env.DB) || 1;
    const now = hoyISO();

    const result = await env.DB.prepare(`
      INSERT INTO LandingPages (
        usuario_id, titulo, slug, descripcion, contenido_json,
        html_personalizado, css_personalizado, color_principal, color_secundario,
        fuente, formulario_activo, campos_formulario, boton_cta_texto, boton_cta_url,
        seo_titulo, seo_descripcion, seo_keywords, creado_en, actualizado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, titulo.trim(), slug.trim(), descripcion?.trim() || '',
      contenido_json || '{}',
      html_personalizado || '',
      css_personalizado || '',
      color_principal || '#2563eb',
      color_secundario || '#1e40af',
      fuente || 'Inter',
      formulario_activo !== undefined ? (formulario_activo ? 1 : 0) : 1,
      JSON.stringify(campos_formulario || ['nombre', 'email', 'telefono', 'mensaje']),
      boton_cta_texto || 'Contáctanos',
      boton_cta_url || '#contacto',
      seo_titulo?.trim() || '',
      seo_descripcion?.trim() || '',
      seo_keywords?.trim() || '',
      now, now
    ).run();

    const landing = await env.DB.prepare(
      'SELECT * FROM LandingPages WHERE id = ?'
    ).bind(result.meta.last_row_id).first();

    return jsonResponse({ landing_page: landing }, 201);

  } catch (error) {
    return errorResponse('Error creando landing page: ' + error.message, 500);
  }
}

// ─────────────────────────────────────────────
// PUT - Update landing page
// ─────────────────────────────────────────────
async function handlePut(env, request) {
  try {
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return errorResponse('ID es requerido');
    }

    const existing = await env.DB.prepare(
      'SELECT id, slug FROM LandingPages WHERE id = ?'
    ).bind(parseInt(id)).first();

    if (!existing) {
      return errorResponse('Landing page no encontrada', 404);
    }

    // Check unique slug if changing
    if (fields.slug && fields.slug.trim() !== existing.slug) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug)) {
        return errorResponse('Slug inválido');
      }
      const dup = await env.DB.prepare(
        'SELECT id FROM LandingPages WHERE slug = ? AND id != ? LIMIT 1'
      ).bind(fields.slug.trim(), parseInt(id)).first();
      if (dup) {
        return errorResponse('Ya existe una landing page con ese slug');
      }
    }

    const allowedFields = [
      'titulo', 'slug', 'descripcion', 'contenido_json', 'html_personalizado',
      'css_personalizado', 'color_principal', 'color_secundario', 'fuente',
      'formulario_activo', 'campos_formulario', 'boton_cta_texto', 'boton_cta_url',
      'seo_titulo', 'seo_descripcion', 'seo_keywords', 'google_analytics',
      'facebook_pixel', 'publica', 'visitas', 'conversiones',
      'logo_r2', 'favicon_r2', 'bg_image_r2',
    ];

    const jsonFields = ['campos_formulario'];

    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(fields)) {
      if (!allowedFields.includes(key)) continue;

      const finalValue = jsonFields.includes(key) && typeof value !== 'string'
        ? JSON.stringify(value)
        : value;

      updates.push(`${key} = ?`);
      params.push(finalValue);
    }

    if (updates.length === 0) {
      return errorResponse('No hay campos para actualizar');
    }

    updates.push('actualizado_en = ?');
    params.push(hoyISO());
    params.push(parseInt(id));

    await env.DB.prepare(
      `UPDATE LandingPages SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    const landing = await env.DB.prepare(
      'SELECT * FROM LandingPages WHERE id = ?'
    ).bind(parseInt(id)).first();

    return jsonResponse({ landing_page: landing });

  } catch (error) {
    return errorResponse('Error actualizando landing page: ' + error.message, 500);
  }
}

// ─────────────────────────────────────────────
// DELETE - Delete landing page
// ─────────────────────────────────────────────
async function handleDelete(env, request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return errorResponse('ID es requerido');
  }

  try {
    const existing = await env.DB.prepare(
      'SELECT id FROM LandingPages WHERE id = ?'
    ).bind(parseInt(id)).first();

    if (!existing) {
      return errorResponse('Landing page no encontrada', 404);
    }

    // Delete associated media from R2 (logo, favicon, bg)
    const landing = await env.DB.prepare(
      'SELECT logo_r2, favicon_r2, bg_image_r2 FROM LandingPages WHERE id = ?'
    ).bind(parseInt(id)).first();

    const mediaPaths = [landing.logo_r2, landing.favicon_r2, landing.bg_image_r2].filter(Boolean);
    for (const path of mediaPaths) {
      try { await env.MEDIA.delete(path); } catch (e) { console.warn('R2 delete failed:', e); }
    }

    await env.DB.prepare('DELETE FROM LandingPages WHERE id = ?').bind(parseInt(id)).run();

    return jsonResponse({ deleted: true, id: parseInt(id) });

  } catch (error) {
    return errorResponse('Error eliminando landing page: ' + error.message, 500);
  }
}

// ─────────────────────────────────────────────
// POST - Upload media for landing page (R2)
// Body: { landing_id, tipo: 'logo'|'favicon'|'bg'|'imagen', archivo_base64, mime_type }
// ─────────────────────────────────────────────
async function handleUploadMedia(env, request) {
  try {
    const body = await request.json();

    if (!body.landing_id || !body.tipo || !body.archivo_base64) {
      return errorResponse('Campos obligatorios: landing_id, tipo, archivo_base64');
    }

    const { landing_id, tipo, archivo_base64, mime_type } = body;

    const validTipos = ['logo', 'favicon', 'bg', 'imagen'];
    if (!validTipos.includes(tipo)) {
      return errorResponse(`Tipo inválido. Valores: ${validTipos.join(', ')}`);
    }

    // Check landing exists
    const landing = await env.DB.prepare(
      'SELECT id, usuario_id FROM LandingPages WHERE id = ?'
    ).bind(parseInt(landing_id)).first();

    if (!landing) {
      return errorResponse('Landing page no encontrada', 404);
    }

    // Determine extension
    const mimeType = mime_type || 'image/png';
    let extension = 'png';
    if (mimeType.includes('jpg') || mimeType.includes('jpeg')) extension = 'jpg';
    else if (mimeType.includes('webp')) extension = 'webp';
    else if (mimeType.includes('ico')) extension = 'ico';

    const buffer = base64ToArrayBuffer(archivo_base64);
    const rutaR2 = generarRutaLanding(parseInt(landing_id), tipo, extension);

    // Upload to R2
    const r2Result = await subirArchivoR2(env.MEDIA, rutaR2, buffer, {
      contentType: mimeType,
      metadata: {
        tipo: `landing_${tipo}`,
        landing_id: landing_id.toString(),
      }
    });

    const now = hoyISO();

    // Register in MediosR2
    await env.DB.prepare(`
      INSERT INTO MediosR2 (usuario_id, ruta, nombre_original, mime_type, tamano_bytes,
        tipo_recurso, recurso_id, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      landing.usuario_id,
      rutaR2,
      `landing_${tipo}_${landing_id}.${extension}`,
      mimeType,
      buffer.byteLength,
      tipo === 'logo' ? 'logo' : tipo === 'bg' ? 'landing_bg' : 'landing_image',
      parseInt(landing_id),
      now
    ).run();

    // Update landing page with R2 path
    const fieldMap = {
      'logo': 'logo_r2',
      'favicon': 'favicon_r2',
      'bg': 'bg_image_r2',
      'imagen': 'bg_image_r2', // Images also go to bg_image_r2 or we could add more fields
    };

    const field = fieldMap[tipo];
    if (field) {
      await env.DB.prepare(`
        UPDATE LandingPages SET ${field} = ?, actualizado_en = ? WHERE id = ?
      `).bind(rutaR2, now, parseInt(landing_id)).run();
    }

    return jsonResponse({
      url: r2Result.urlPublica,
      ruta: rutaR2,
      tipo,
      campo_actualizado: field,
      tamano_bytes: buffer.byteLength,
      mensaje: `Media de landing page subida a R2`,
    }, 201);

  } catch (error) {
    return errorResponse('Error subiendo media: ' + error.message, 500);
  }
}
