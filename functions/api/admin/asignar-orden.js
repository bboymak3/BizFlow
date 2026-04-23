// ============================================
// API: ASIGNAR ORDEN A TÉCNICO
// Global Pro Automotriz
// ============================================

import { registrarNotificacion } from '../../lib/notificaciones.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id y tecnico_id'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden existe y está aprobada
    const orden = await env.DB.prepare(
      "SELECT id FROM OrdenesTrabajo WHERE id = ? AND estado = 'Aprobada'"
    ).bind(data.orden_id).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o no está aprobada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Verificar que el técnico existe y está activo
    const tecnico = await env.DB.prepare(
      "SELECT id, nombre FROM Tecnicos WHERE id = ? AND activo = 1"
    ).bind(data.tecnico_id).first();

    if (!tecnico) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Técnico no encontrado o no está activo'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Verificar que la orden no esté ya asignada (a menos que sea reasignación forzada)
    if (!data.force) {
      const ordenActual = await env.DB.prepare(
        "SELECT tecnico_asignado_id FROM OrdenesTrabajo WHERE id = ?"
      ).bind(data.orden_id).first();

      if (ordenActual && ordenActual.tecnico_asignado_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'La orden ya está asignada a un técnico'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }
    }

    // Asignar orden al técnico
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET tecnico_asignado_id = ?,
          estado_trabajo = 'Pendiente Visita'
      WHERE id = ?
    `).bind(data.tecnico_id, data.orden_id).run();

    // Registrar notificación WhatsApp
    try {
      const ordenInfo = await env.DB.prepare(
        'SELECT o.numero_orden, o.patente_placa, COALESCE(o.cliente_telefono, c.telefono) as cliente_telefono, COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre FROM OrdenesTrabajo o LEFT JOIN Clientes c ON o.cliente_id = c.id WHERE o.id = ?'
      ).bind(data.orden_id).first();
      if (ordenInfo && ordenInfo.cliente_telefono) {
        await registrarNotificacion(env, data.orden_id, ordenInfo.cliente_telefono, 'orden_asignada', ordenInfo);
      }
    } catch (ne) { console.log('Notificación no registrada:', ne.message); }

    return new Response(JSON.stringify({
      success: true,
      mensaje: `Orden asignada al técnico ${tecnico.nombre}`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al asignar orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
