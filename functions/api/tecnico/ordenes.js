// ============================================
// BIZFLOW - Técnico Orders List
// GET /api/tecnico/ordenes?tecnico_id=X
// Obtener órdenes de trabajo de un técnico, categorizadas por estado
// ============================================

import {
  corsHeaders,
  handleOptions,
  successResponse,
  errorResponse,
} from '../../lib/db-helpers.js';

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const tecnicoId = url.searchParams.get('tecnico_id');

  if (!tecnicoId) {
    return errorResponse('Parámetro tecnico_id es obligatorio');
  }

  try {
    // Fetch all orders assigned to this technician
    // Join with Clientes to get client name and phone
    const orders = await env.DB.prepare(`
      SELECT
        ot.*,
        c.nombre AS cliente_nombre,
        c.telefono AS cliente_telefono,
        c.direccion AS cliente_direccion,
        t.nombre AS tecnico_nombre
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
      WHERE ot.tecnico_asignado_id = ?
        AND ot.estado != 'Eliminada'
      ORDER BY ot.fecha_creacion DESC
    `).bind(parseInt(tecnicoId)).all();

    if (!orders.results) {
      return successResponse({ pendientes: [], en_curso: [], completadas: [] });
    }

    // Categorize orders by estado_trabajo
    const pendientes = [];
    const en_curso = [];
    const completadas = [];

    for (const order of orders.results) {
      const estado = order.estado_trabajo;

      if (estado === 'Pendiente Visita' || (!estado && order.estado === 'Enviada')) {
        pendientes.push(order);
      } else if (estado === 'En Sitio' || estado === 'En Progreso' || estado === 'Pendiente Piezas') {
        en_curso.push(order);
      } else if (estado === 'Completada' || estado === 'Cerrada' || estado === 'No Completada') {
        completadas.push(order);
      } else {
        // Unknown state - treat as pending
        pendientes.push(order);
      }
    }

    return successResponse({
      pendientes,
      en_curso,
      completadas,
      total_pendientes: pendientes.length,
      total_en_curso: en_curso.length,
      total_completadas: completadas.length,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return errorResponse('Error al obtener las órdenes de trabajo', 500);
  }
}
