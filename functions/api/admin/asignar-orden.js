// ============================================================
// BizFlow - Asignar Orden API
// POST: Assign/unassign order to technician + WhatsApp notification
// ============================================================

import {
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  chileNowISO,
  asegurarColumnasFaltantes,
} from '../../lib/db-helpers.js';
import { enviarNotificacionOrden } from '../../lib/notificaciones.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { orden_id, tecnico_id, accion } = data;

  if (!orden_id) {
    return errorRes('orden_id es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Load order
    const orden = await env.DB.prepare(
      `SELECT * FROM OrdenesTrabajo WHERE id = ?`
    ).bind(orden_id).first();

    if (!orden) {
      return errorRes('Orden no encontrada', 404);
    }

    // ---- UNASSIGN ----
    if (accion === 'desasignar') {
      await env.DB.prepare(`
        UPDATE OrdenesTrabajo
        SET tecnico_asignado_id = NULL, estado_trabajo = NULL
        WHERE id = ?
      `).bind(orden_id).run();

      const updated = await env.DB.prepare(
        `SELECT * FROM OrdenesTrabajo WHERE id = ?`
      ).bind(orden_id).first();

      return successRes({ orden: updated, accion: 'desasignada' });
    }

    // ---- ASSIGN ----
    if (!tecnico_id) {
      return errorRes('tecnico_id es requerido para asignar');
    }

    // Verify technician exists and is active
    const tecnico = await env.DB.prepare(
      `SELECT * FROM Tecnicos WHERE id = ? AND activo = 1`
    ).bind(tecnico_id).first();

    if (!tecnico) {
      return errorRes('Técnico no encontrado o inactivo', 404);
    }

    // Verify order is in an assignable state
    const estadosValidos = ['Enviada', 'Aprobada', 'Pendiente Visita', 'Pendiente', 'En Proceso', 'en_progreso'];
    if (!estadosValidos.includes(orden.estado) && orden.estado_trabajo !== 'Pendiente Visita') {
      return errorRes(`La orden en estado "${orden.estado}" no puede ser asignada`);
    }

    // Update order
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET tecnico_asignado_id = ?, estado_trabajo = 'Pendiente Visita'
      WHERE id = ?
    `).bind(tecnico_id, orden_id).run();

    // Send WhatsApp notification to technician (fire-and-forget)
    enviarNotificacionOrden(env, orden_id, 'orden_asignada').catch(err => {
      console.error('Error enviando notificación de asignación:', err);
    });

    // Return updated order with technician info
    const updated = await env.DB.prepare(`
      SELECT
        ot.*,
        t.nombre as tecnico_nombre,
        t.telefono as tecnico_telefono
      FROM OrdenesTrabajo ot
      LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
      WHERE ot.id = ?
    `).bind(orden_id).first();

    return successRes({ orden: updated, accion: 'asignada' });
  } catch (error) {
    console.error('Asignar orden error:', error);
    return errorRes('Error asignando orden: ' + error.message, 500);
  }
}
