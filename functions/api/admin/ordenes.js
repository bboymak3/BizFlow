// ============================================================
// BizFlow - Admin Ordenes API
// GET: List orders with filters and joins
// POST: Create order (generates next number)
// ============================================================

import { jsonResponse, errorResponse, handleCors, getProximoNumero, hoyISO } from '../../lib/db-helpers.js';
import { notificarNuevaOT } from '../../lib/notificaciones.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const { DB, MEDIA } = env;

  try {
    if (request.method === 'GET') {
      return await handleGet(request, DB);
    } else if (request.method === 'POST') {
      return await handlePost(request, DB, env);
    } else {
      return errorResponse('Método no permitido', 405);
    }
  } catch (error) {
    console.error('Ordenes error:', error);
    return errorResponse('Error en órdenes: ' + error.message, 500);
  }
}

async function handleGet(request, DB) {
  const url = new URL(request.url);
  const usuarioId = url.searchParams.get('usuario_id');
  const estado = url.searchParams.get('estado');
  const tecnicoId = url.searchParams.get('tecnico_id');
  const clienteId = url.searchParams.get('cliente_id');
  const fechaDesde = url.searchParams.get('fecha_desde');
  const fechaHasta = url.searchParams.get('fecha_hasta');
  const prioridad = url.searchParams.get('prioridad');
  const search = url.searchParams.get('search') || '';
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;

  if (!usuarioId) {
    usuarioId = '1';
  }

  let whereClause = 'WHERE ot.usuario_id = ?';
  const params = [usuarioId];

  if (estado) {
    whereClause += ' AND ot.estado = ?';
    params.push(estado);
  }

  if (tecnicoId) {
    whereClause += ' AND ot.tecnico_id = ?';
    params.push(tecnicoId);
  }

  if (clienteId) {
    whereClause += ' AND ot.cliente_id = ?';
    params.push(clienteId);
  }

  if (fechaDesde) {
    whereClause += ' AND ot.fecha_creacion >= ?';
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    whereClause += ' AND ot.fecha_creacion <= ?';
    params.push(fechaHasta);
  }

  if (prioridad) {
    whereClause += ' AND ot.prioridad = ?';
    params.push(prioridad);
  }

  if (search.trim()) {
    whereClause += ' AND (ot.numero LIKE ? OR ot.titulo LIKE ? OR ot.descripcion LIKE ? OR ot.diagnostico LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  // Count
  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM OrdenesTrabajo ot ${whereClause}`
  ).bind(...params).first();

  // Results with joins
  const offset = (page - 1) * limit;
  const { results } = await DB.prepare(`
    SELECT
      ot.*,
      c.id as cliente_id, c.nombre as cliente_nombre, c.apellido as cliente_apellido,
      c.empresa as cliente_empresa, c.telefono as cliente_telefono, c.email as cliente_email,
      v.id as vehiculo_id, v.placa, v.marca as vehiculo_marca, v.modelo as vehiculo_modelo,
      v.anio as vehiculo_anio, v.color as vehiculo_color,
      t.id as tecnico_db_id, t.nombre as tecnico_nombre, t.telefono as tecnico_telefono,
      t.especialidad as tecnico_especialidad
    FROM OrdenesTrabajo ot
    LEFT JOIN Clientes c ON ot.cliente_id = c.id
    LEFT JOIN Vehiculos v ON ot.vehiculo_id = v.id
    LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
    ${whereClause}
    ORDER BY ot.fecha_creacion DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  // Get cost totals for each order
  const enrichedResults = [];
  for (const ot of (results || [])) {
    const costosResult = await DB.prepare(
      'SELECT COALESCE(SUM(total), 0) as total_costos FROM CostosAdicionales WHERE orden_id = ?'
    ).bind(ot.id).first();

    const pagosResult = await DB.prepare(
      'SELECT COALESCE(SUM(monto), 0) as total_pagado FROM Pagos WHERE orden_id = ?'
    ).bind(ot.id).first();

    const fotosCount = await DB.prepare(
      'SELECT COUNT(*) as total FROM FotosTrabajo WHERE orden_id = ?'
    ).bind(ot.id).first();

    enrichedResults.push({
      ...ot,
      total_costos_adicionales: costosResult?.total_costos || 0,
      total_pagado: pagosResult?.total_pagado || 0,
      total_fotos: fotosCount?.total || 0,
    });
  }

  return jsonResponse({
    ordenes: enrichedResults,
    paginacion: {
      page,
      limit,
      total: countResult?.total || 0,
      total_pages: Math.ceil((countResult?.total || 0) / limit),
    }
  });
}

async function handlePost(request, DB, env) {
  const data = await request.json();

  const {
    usuario_id, cliente_id, vehiculo_id, tipo, prioridad,
    titulo, descripcion, latitud_ubicacion, longitud_ubicacion, origen,
  } = data;

  if (!usuario_id) usuario_id = 1;
  if (!titulo && !descripcion) return errorResponse('titulo o descripción es requerido');

  // Verify client exists
  if (cliente_id) {
    const cliente = await DB.prepare(
      'SELECT id FROM Clientes WHERE id = ? AND usuario_id = ? AND activo = 1'
    ).bind(cliente_id, usuario_id).first();

    if (!cliente) {
      return errorResponse('Cliente no encontrado', 404);
    }
  }

  // Verify vehicle exists and belongs to client
  if (vehiculo_id) {
    const vehiculo = await DB.prepare(
      'SELECT id, cliente_id FROM Vehiculos WHERE id = ? AND activo = 1'
    ).bind(vehiculo_id).first();

    if (!vehiculo) {
      return errorResponse('Vehículo no encontrado', 404);
    }

    if (cliente_id && vehiculo.cliente_id !== parseInt(cliente_id)) {
      return errorResponse('El vehículo no pertenece al cliente indicado');
    }
  }

  // Generate next order number
  const numero = await getProximoNumero(DB, usuario_id);

  const now = hoyISO();

  const result = await DB.prepare(`
    INSERT INTO OrdenesTrabajo (
      usuario_id, numero, cliente_id, vehiculo_id, tipo, prioridad,
      titulo, descripcion, latitud_ubicacion, longitud_ubicacion,
      origen, fecha_creacion, creado_en, actualizado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    usuario_id,
    numero,
    cliente_id || null,
    vehiculo_id || null,
    tipo || 'mantenimiento',
    prioridad || 'normal',
    titulo?.trim() || '',
    descripcion?.trim() || '',
    latitud_ubicacion || 0,
    longitud_ubicacion || 0,
    origen || 'manual',
    now,
    now,
    now
  ).run();

  const ordenId = result.meta.last_row_id;

  // Create initial tracking entry
  await DB.prepare(`
    INSERT INTO SeguimientoOT (orden_id, estado_anterior, estado_nuevo, realizado_por, realizado_por_tipo)
    VALUES (?, '', 'pendiente', 'sistema', 'sistema')
  `).bind(ordenId).run();

  // Send notification (async, non-blocking)
  notificarNuevaOT(env, DB, ordenId).catch(err => {
    console.error('Notification error:', err);
  });

  // Get the created order with joins
  const orden = await DB.prepare(`
    SELECT
      ot.*,
      c.nombre as cliente_nombre, c.apellido as cliente_apellido,
      c.empresa as cliente_empresa, c.telefono as cliente_telefono,
      v.placa, v.marca as vehiculo_marca, v.modelo as vehiculo_modelo
    FROM OrdenesTrabajo ot
    LEFT JOIN Clientes c ON ot.cliente_id = c.id
    LEFT JOIN Vehiculos v ON ot.vehiculo_id = v.id
    WHERE ot.id = ?
  `).bind(ordenId).first();

  return jsonResponse({ orden }, 201);
}
