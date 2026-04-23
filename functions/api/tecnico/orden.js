// ============================================
// BIZFLOW - Order Detail
// GET /api/tecnico/orden?id=X
// Obtener detalle completo de una orden de trabajo
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
  const ordenId = url.searchParams.get('id');

  if (!ordenId) {
    return errorResponse('Parámetro id es obligatorio');
  }

  try {
    // 1. Get main order data with client and technician info
    const orden = await env.DB.prepare(`
      SELECT
        ot.*,
        c.id AS cliente_id,
        c.nombre AS cliente_nombre,
        c.telefono AS cliente_telefono,
        c.email AS cliente_email,
        c.direccion AS cliente_direccion,
        c.rut AS cliente_rut,
        t.nombre AS tecnico_nombre,
        t.telefono AS tecnico_telefono
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
      WHERE ot.id = ?
    `).bind(parseInt(ordenId)).first();

    if (!orden) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // 2. Get additional costs
    const costos = await env.DB.prepare(`
      SELECT * FROM CostosAdicionales
      WHERE orden_id = ?
      ORDER BY fecha_registro ASC
    `).bind(parseInt(ordenId)).all();

    // 3. Get work notes
    const notas = await env.DB.prepare(`
      SELECT
        nt.*,
        t.nombre AS tecnico_nombre
      FROM NotasTrabajo nt
      LEFT JOIN Tecnicos t ON nt.tecnico_id = t.id
      WHERE nt.orden_id = ?
      ORDER BY nt.fecha_nota DESC
    `).bind(parseInt(ordenId)).all();

    // 4. Get work photos (exclude base64 from list, just metadata)
    const fotos = await env.DB.prepare(`
      SELECT
        id,
        orden_id,
        tecnico_id,
        tipo,
        fecha_subida,
        LENGTH(foto_base64) AS tamano_bytes
      FROM FotosTrabajo
      WHERE orden_id = ?
      ORDER BY fecha_subida ASC
    `).bind(parseInt(ordenId)).all();

    // 5. Get tracking history (seguimiento)
    const seguimiento = await env.DB.prepare(`
      SELECT
        s.*,
        t.nombre AS tecnico_nombre
      FROM SeguimientoOT s
      LEFT JOIN Tecnicos t ON s.tecnico_id = t.id
      WHERE s.orden_id = ?
      ORDER BY s.fecha_evento DESC
    `).bind(parseInt(ordenId)).all();

    // 6. Get payments
    const pagos = await env.DB.prepare(`
      SELECT * FROM Pagos
      WHERE orden_id = ?
      ORDER BY fecha_pago DESC
    `).bind(parseInt(ordenId)).all();

    // 7. Parse services if stored as JSON
    let servicios = [];
    if (orden.servicios_seleccionados) {
      try {
        servicios = JSON.parse(orden.servicios_seleccionados);
      } catch {
        servicios = orden.servicios_seleccionados.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    // 8. Parse checklist if stored as JSON
    let checklist = null;
    if (orden.diagnostico_checks) {
      try {
        checklist = JSON.parse(orden.diagnostico_checks);
      } catch {
        checklist = orden.diagnostico_checks;
      }
    }

    return successResponse({
      orden: {
        ...orden,
        servicios,
        checklist,
      },
      costos: costos.results || [],
      notas: notas.results || [],
      fotos: fotos.results || [],
      seguimiento: seguimiento.results || [],
      pagos: pagos.results || [],
    });
  } catch (error) {
    console.error('Error fetching order detail:', error);
    return errorResponse('Error al obtener el detalle de la orden', 500);
  }
}
