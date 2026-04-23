// ============================================================
// BizFlow - Admin Clientes API
// GET: List clients with search/pagination
// POST: Create client
// ============================================================

import { jsonResponse, errorResponse, handleCors, paginar } from '../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const { DB } = env;

  try {
    if (request.method === 'GET') {
      return await handleGet(request, DB);
    } else if (request.method === 'POST') {
      return await handlePost(request, DB);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Clientes error:', error);
    return errorResponse('Error en clientes: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  let usuarioId = url.searchParams.get('usuario_id');
  const search = url.searchParams.get('search') || '';
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;

  if (!usuarioId) {
    usuarioId = '1';
  }

  let whereClause = 'WHERE c.usuario_id = ? AND c.activo = 1';
  const params = [usuarioId];

  if (search.trim()) {
    whereClause += ` AND (
      c.nombre LIKE ? OR c.apellido LIKE ? OR c.empresa LIKE ?
      OR c.cedula_rif LIKE ? OR c.email LIKE ? OR c.telefono LIKE ?
    )`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term, term);
  }

  // Get total count
  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM Clientes c ${whereClause}`
  ).bind(...params).first();

  // Get paginated results
  const offset = (page - 1) * limit;
  const { results } = await DB.prepare(`
    SELECT
      c.id, c.usuario_id, c.empresa, c.nombre, c.apellido, c.cedula_rif,
      c.email, c.telefono, c.telefono2, c.direccion, c.ciudad, c.estado,
      c.codigo_postal, c.notas, c.origen, c.creado_en, c.actualizado_en,
      (SELECT COUNT(*) FROM Vehiculos v WHERE v.cliente_id = c.id AND v.activo = 1) as total_vehiculos,
      (SELECT COUNT(*) FROM OrdenesTrabajo ot WHERE ot.cliente_id = c.id) as total_ots
    FROM Clientes c
    ${whereClause}
    ORDER BY c.creado_en DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return jsonResponse({
    clientes: results || [],
    paginacion: {
      page,
      limit,
      total: countResult?.total || 0,
      total_pages: Math.ceil((countResult?.total || 0) / limit),
    }
  });
}

async function handlePost(request, DB) {
  const data = await request.json();

  let {
    usuario_id, empresa, nombre, apellido, cedula_rif,
    email, telefono, telefono2, direccion, ciudad,
    estado, codigo_postal, notas, origen,
  } = data;

  if (!usuario_id) usuario_id = 1;
  if (!nombre || !nombre.trim()) return errorResponse('nombre es requerido');

  // Check for duplicate cedula_rif
  if (cedula_rif && cedula_rif.trim()) {
    const existing = await DB.prepare(
      'SELECT id FROM Clientes WHERE cedula_rif = ? AND usuario_id = ? AND activo = 1'
    ).bind(cedula_rif.trim(), usuario_id).first();

    if (existing) {
      return errorResponse('Ya existe un cliente con esa cédula/RIF');
    }
  }

  const result = await DB.prepare(`
    INSERT INTO Clientes (usuario_id, empresa, nombre, apellido, cedula_rif,
      email, telefono, telefono2, direccion, ciudad, estado, codigo_postal,
      notas, origen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    usuario_id,
    empresa?.trim() || '',
    nombre.trim(),
    apellido?.trim() || '',
    cedula_rif?.trim() || '',
    email?.trim() || '',
    telefono?.trim() || '',
    telefono2?.trim() || '',
    direccion?.trim() || '',
    ciudad?.trim() || '',
    estado?.trim() || '',
    codigo_postal?.trim() || '',
    notas?.trim() || '',
    origen || 'manual'
  ).run();

  const cliente = await DB.prepare(
    'SELECT * FROM Clientes WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ cliente }, 201);
}
