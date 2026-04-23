// ============================================================
// BizFlow - Todas las Ordenes (All Work Orders) API
// GET: List all orders paginated with filters
// ============================================================

import {
  corsHeaders,
  handleOptions,
  successRes,
  errorRes,
  chileDate,
  getFechaColumn,
  buildFechaWhere,
  asegurarColumnasFaltantes,
} from '../../lib/db-helpers.js';

const PAGE_SIZE = 50;

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  const page = parseInt(url.searchParams.get('pagina')) || 1;
  const estado = url.searchParams.get('estado');
  const estadoTrabajo = url.searchParams.get('estado_trabajo');
  const tecnicoId = url.searchParams.get('tecnico_id');
  const patente = url.searchParams.get('patente');
  const periodo = url.searchParams.get('periodo');
  const valor = url.searchParams.get('valor') || chileDate();
  const negocioId = url.searchParams.get('negocio_id') || '1';
  const sortBy = url.searchParams.get('sort_by') || 'fecha_creacion';
  const sortOrder = url.searchParams.get('sort_order') || 'DESC';

  try {
    await asegurarColumnasFaltantes(env);

    // Build WHERE conditions
    const conditions = ['ot.estado != "Eliminada"'];
    const params = [];

    // Negocio filter
    conditions.push('(ot.negocio_id = ? OR ot.negocio_id IS NULL)');
    params.push(negocioId);

    // Estado filter
    if (estado) {
      conditions.push('ot.estado = ?');
      params.push(estado);
    }

    // Estado trabajo filter
    if (estadoTrabajo) {
      conditions.push('ot.estado_trabajo = ?');
      params.push(estadoTrabajo);
    }

    // Tecnico filter
    if (tecnicoId) {
      conditions.push('ot.tecnico_asignado_id = ?');
      params.push(parseInt(tecnicoId));
    }

    // Patente search
    if (patente) {
      conditions.push('ot.patente LIKE ?');
      params.push(`%${patente.trim().toUpperCase()}%`);
    }

    // Date filter
    if (periodo && periodo !== 'todo') {
      const fechaCol = await getFechaColumn(env);
      const fechaWhere = buildFechaWhere(fechaCol, periodo, valor);
      if (fechaWhere.where) {
        conditions.push(fechaWhere.where.replace(' AND ', '').replace(/^\(/, '('));
        params.push(...fechaWhere.params);
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Validate sort column
    const validSortColumns = [
      'fecha_creacion', 'fecha', 'id', 'numero_orden', 'patente',
      'monto_base', 'monto_final', 'estado', 'estado_trabajo',
      'cliente_nombre', 'created_at',
    ];
    const finalSortBy = validSortColumns.includes(sortBy) ? sortBy : 'fecha_creacion';
    const finalSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM OrdenesTrabajo ot ${whereClause}`
    ).bind(...params).first();

    const total = countResult?.total || 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const offset = (page - 1) * PAGE_SIZE;

    // Get orders with joins
    const query = `
      SELECT
        ot.*,
        c.nombre as cliente_nombre_completo,
        c.email as cliente_email,
        c.direccion as cliente_direccion,
        t.nombre as tecnico_nombre,
        t.telefono as tecnico_telefono
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id OR (c.telefono = ot.cliente_telefono AND (c.negocio_id = ot.negocio_id OR c.negocio_id IS NULL))
      LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
      ${whereClause}
      ORDER BY ot.${finalSortBy} ${finalSortOrder}
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, PAGE_SIZE, offset];
    const result = await env.DB.prepare(query).bind(...queryParams).all();
    const ordenes = result.results || [];

    // Get services for each order (batch)
    let serviciosMap = {};
    try {
      const ordenIds = ordenes.map(o => o.id);
      if (ordenIds.length > 0) {
        // Get services in batches of 100
        for (let i = 0; i < ordenIds.length; i += 100) {
          const batch = ordenIds.slice(i, i + 100);
          const placeholders = batch.map(() => '?').join(',');
          const servResult = await env.DB.prepare(
            `SELECT * FROM ServiciosOrden WHERE orden_id IN (${placeholders})`
          ).bind(...batch).all();

          for (const serv of (servResult.results || [])) {
            if (!serviciosMap[serv.orden_id]) {
              serviciosMap[serv.orden_id] = [];
            }
            serviciosMap[serv.orden_id].push(serv);
          }
        }
      }
    } catch {
      // ServiciosOrden table might not exist
    }

    // Attach services to orders
    const ordenesWithServices = ordenes.map(ot => ({
      ...ot,
      servicios: serviciosMap[ot.id] || [],
    }));

    return successRes({
      ordenes: ordenesWithServices,
      paginacion: {
        pagina: page,
        por_pagina: PAGE_SIZE,
        total,
        total_paginas: totalPages,
        tiene_siguiente: page < totalPages,
      },
    });
  } catch (error) {
    console.error('Todas ordenes error:', error);
    return errorRes('Error listando órdenes: ' + error.message, 500);
  }
}
