// ============================================================
// BizFlow - Admin Vehiculos API
// GET: List vehicles with search/filter
// POST: Create vehicle
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../lib/db-helpers.js';

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
    console.error('Vehiculos error:', error);
    return errorResponse('Error en vehículos: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  const usuarioId = url.searchParams.get('usuario_id');
  const search = url.searchParams.get('search') || '';
  const clienteId = url.searchParams.get('cliente_id');
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;

  if (!usuarioId) {
    usuarioId = '1';
  }

  // Get client IDs for this user
  const clienteIds = await DB.prepare(
    'SELECT id FROM Clientes WHERE usuario_id = ? AND activo = 1'
  ).bind(usuarioId).all();

  const cIds = (clienteIds.results || []).map(c => c.id);
  if (cIds.length === 0) {
    return jsonResponse({ vehiculos: [], paginacion: { page, limit, total: 0, total_pages: 0 } });
  }

  let whereClause = 'WHERE v.cliente_id IN (' + cIds.join(',') + ') AND v.activo = 1';
  const params = [];

  if (clienteId) {
    whereClause += ' AND v.cliente_id = ?';
    params.push(clienteId);
  }

  if (search.trim()) {
    whereClause += ' AND (v.placa LIKE ? OR v.marca LIKE ? OR v.modelo LIKE ? OR v.vin LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  // Count
  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM Vehiculos v ${whereClause}`
  ).bind(...params).first();

  // Results
  const offset = (page - 1) * limit;
  const { results } = await DB.prepare(`
    SELECT
      v.*,
      c.nombre as cliente_nombre, c.apellido as cliente_apellido, c.empresa as cliente_empresa
    FROM Vehiculos v
    LEFT JOIN Clientes c ON v.cliente_id = c.id
    ${whereClause}
    ORDER BY v.creado_en DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return jsonResponse({
    vehiculos: results || [],
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

  const {
    usuario_id, cliente_id, placa, marca, modelo,
    anio, color, vin, kilometraje, notas,
  } = data;

  if (!cliente_id) return errorResponse('cliente_id es requerido');
  if (!placa || !placa.trim()) return errorResponse('placa es requerida');

  // Verify client exists and belongs to user
  const cliente = await DB.prepare(
    'SELECT id FROM Clientes WHERE id = ? AND usuario_id = ? AND activo = 1'
  ).bind(cliente_id, usuario_id).first();

  if (!cliente) {
    return errorResponse('Cliente no encontrado o no pertenece al usuario', 404);
  }

  // Check for duplicate plate within same client
  const existing = await DB.prepare(
    'SELECT id FROM Vehiculos WHERE placa = ? AND cliente_id = ? AND activo = 1'
  ).bind(placa.trim().toUpperCase(), cliente_id).first();

  if (existing) {
    return errorResponse('Ya existe un vehículo con esa placa para este cliente');
  }

  const result = await DB.prepare(`
    INSERT INTO Vehiculos (cliente_id, placa, marca, modelo, anio, color, vin, kilometraje, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    cliente_id,
    placa.trim().toUpperCase(),
    marca?.trim() || '',
    modelo?.trim() || '',
    anio ? parseInt(anio) : 0,
    color?.trim() || '',
    vin?.trim() || '',
    kilometraje ? parseInt(kilometraje) : 0,
    notas?.trim() || ''
  ).run();

  const vehiculo = await DB.prepare(
    'SELECT * FROM Vehiculos WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ vehiculo }, 201);
}
