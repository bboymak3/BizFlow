// ============================================================
// BizFlow - Notificaciones API
// GET: list notifications (filter ?enviada=0/1)
// POST: mark as sent { id }
// POST: generate wa.me links { orden_id }
// ============================================================

import {
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  asegurarColumnasFaltantes,
  getConfig,
  generarWaMeLink,
  generarMensajeWhatsApp,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

// GET - List notifications
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const enviada = url.searchParams.get('enviada');
  const ordenId = url.searchParams.get('orden_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 200);

  try {
    await asegurarColumnasFaltantes(env);

    let query = `SELECT * FROM NotificacionesWhatsApp WHERE 1=1`;
    const params = [];

    if (enviada === '0' || enviada === '1') {
      query += ` AND enviada = ?`;
      params.push(parseInt(enviada));
    } else if (enviada === 'false') {
      query += ` AND (enviada = 0 OR enviada IS NULL)`;
    } else if (enviada === 'true') {
      query += ` AND enviada = 1`;
    }

    if (ordenId) {
      query += ` AND orden_id = ?`;
      params.push(ordenId);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const result = await env.DB.prepare(query).bind(...params).all();

    // Get counts
    let countQuery = `SELECT COUNT(*) as total FROM NotificacionesWhatsApp WHERE 1=1`;
    const countParams = [];
    if (enviada === '0' || enviada === '1') {
      countQuery += ` AND enviada = ?`;
      countParams.push(parseInt(enviada));
    } else if (enviada === 'false') {
      countQuery += ` AND (enviada = 0 OR enviada IS NULL)`;
    } else if (enviada === 'true') {
      countQuery += ` AND enviada = 1`;
    }
    if (ordenId) {
      countQuery += ` AND orden_id = ?`;
      countParams.push(ordenId);
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();

    return successRes({
      notificaciones: result.results || [],
      total: countResult?.total || 0,
    });
  } catch (error) {
    console.error('Notificaciones list error:', error);
    return errorRes('Error listando notificaciones: ' + error.message, 500);
  }
}

// POST - Mark as sent or generate wa.me links
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { id, orden_id, accion } = data;

  if (!accion) {
    return errorRes('Acción es requerida (marcar_enviada, generar_wame)');
  }

  try {
    await asegurarColumnasFaltantes(env);

    if (accion === 'marcar_enviada') {
      if (!id) {
        return errorRes('ID es requerido para marcar como enviada');
      }

      await env.DB.prepare(`
        UPDATE NotificacionesWhatsApp SET enviada = 1 WHERE id = ?
      `).bind(id).run();

      const notif = await env.DB.prepare(
        `SELECT * FROM NotificacionesWhatsApp WHERE id = ?`
      ).bind(id).first();

      return successRes(notif);
    }

    if (accion === 'generar_wame') {
      if (!orden_id) {
        return errorRes('orden_id es requerido para generar enlace');
      }

      // Load order with client and technician data
      const orden = await env.DB.prepare(`
        SELECT
          ot.id, ot.numero_orden, ot.estado, ot.estado_trabajo,
          ot.patente_placa as patente,
          ot.cliente_nombre, ot.cliente_telefono,
          t.nombre as tecnico_nombre, t.telefono as tecnico_telefono
        FROM OrdenesTrabajo ot
        LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
        WHERE ot.id = ?
      `).bind(orden_id).first();

      if (!orden) {
        return errorRes('Orden no encontrada', 404);
      }

      const links = [];

      // Generate client wa.me link
      if (orden.cliente_telefono) {
        const clienteMsg = generarMensajeWhatsApp(
          orden.estado === 'Cerrada' || orden.estado === 'cerrada' ? 'cerrada' :
          orden.estado_trabajo === 'Completada' ? 'completada' :
          orden.estado === 'Aprobada' ? 'aprobada' : 'en_progreso',
          orden,
          null,
          { nombre: orden.cliente_nombre || 'Cliente' }
        );

        links.push({
          destino: 'cliente',
          nombre: orden.cliente_nombre,
          telefono: orden.cliente_telefono,
          enlace: generarWaMeLink(orden.cliente_telefono, clienteMsg),
          mensaje: clienteMsg,
        });
      }

      // Generate technician wa.me link
      if (orden.tecnico_telefono) {
        const tecMsg = generarMensajeWhatsApp('en_sitio', orden, { nombre: orden.tecnico_nombre });

        links.push({
          destino: 'tecnico',
          nombre: orden.tecnico_nombre,
          telefono: orden.tecnico_telefono,
          enlace: generarWaMeLink(orden.tecnico_telefono, tecMsg),
          mensaje: tecMsg,
        });
      }

      if (links.length === 0) {
        return errorRes('No hay teléfonos disponibles para generar enlaces');
      }

      return successRes(links);
    }

    return errorRes(`Acción no reconocida: ${accion}`);
  } catch (error) {
    console.error('Notificaciones post error:', error);
    return errorRes('Error procesando notificación: ' + error.message, 500);
  }
}
