// ============================================================
// BizFlow - Admin Inventario API
// GET: List inventory items with search/filter
// POST: Create inventory item
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
    console.error('Inventario error:', error);
    return errorResponse('Error en inventario: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  let usuarioId = url.searchParams.get('usuario_id');
  const search = url.searchParams.get('search') || '';
  const categoria = url.searchParams.get('categoria');
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;

  if (!usuarioId) {
    // Default to usuario_id 1 when not provided
    usuarioId = '1';
  }

  let whereClause = 'WHERE usuario_id = ? AND activo = 1';
  const params = [usuarioId];

  if (search.trim()) {
    whereClause += ' AND (nombre LIKE ? OR codigo LIKE ? OR descripcion LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  if (categoria) {
    whereClause += ' AND categoria = ?';
    params.push(categoria);
  }

  // Count
  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM Inventario ${whereClause}`
  ).bind(...params).first();

  // Low stock count
  const lowStockCount = await DB.prepare(
    `SELECT COUNT(*) as total FROM Inventario WHERE usuario_id = ? AND activo = 1 AND cantidad <= cantidad_minima`
  ).bind(usuarioId).first();

  // Results
  const offset = (page - 1) * limit;
  const { results } = await DB.prepare(`
    SELECT * FROM Inventario
    ${whereClause}
    ORDER BY nombre ASC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return jsonResponse({
    items: results || [],
    paginacion: {
      page,
      limit,
      total: countResult?.total || 0,
      total_pages: Math.ceil((countResult?.total || 0) / limit),
    },
    stock_bajo: lowStockCount?.total || 0,
  });
}

async function handlePost(request, DB) {
  const data = await request.json();

  let {
    usuario_id, codigo, nombre, descripcion, categoria,
    cantidad, cantidad_minima, precio_compra, precio_venta,
    proveedor, ubicacion,
  } = data;

  if (!usuario_id) usuario_id = 1;
  if (!nombre || !nombre.trim()) return errorResponse('nombre es requerido');

  // Check for duplicate code
  if (codigo && codigo.trim()) {
    const existing = await DB.prepare(
      'SELECT id FROM Inventario WHERE codigo = ? AND usuario_id = ? AND activo = 1'
    ).bind(codigo.trim(), usuario_id).first();

    if (existing) {
      return errorResponse('Ya existe un item con ese código');
    }
  }

  const result = await DB.prepare(`
    INSERT INTO Inventario (usuario_id, codigo, nombre, descripcion, categoria,
      cantidad, cantidad_minima, precio_compra, precio_venta, proveedor, ubicacion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    usuario_id,
    codigo?.trim() || '',
    nombre.trim(),
    descripcion?.trim() || '',
    categoria?.trim() || 'general',
    parseInt(cantidad) || 0,
    parseInt(cantidad_minima) || 5,
    parseFloat(precio_compra) || 0,
    parseFloat(precio_venta) || 0,
    proveedor?.trim() || '',
    ubicacion?.trim() || ''
  ).run();

  const item = await DB.prepare(
    'SELECT * FROM Inventario WHERE id = ?'
  ).bind(result.meta.last_row_id).first();

  return jsonResponse({ item }, 201);
}
