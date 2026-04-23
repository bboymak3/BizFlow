// ============================================================
// BizFlow - Admin Ordenes [id] Asignar API
// PUT: Assign technician to order, changes status to 'asignada'
// ============================================================

import { jsonResponse, errorResponse, handleCors, hoyISO } from '../../../../lib/db-helpers.js';
import { enviarNotificacion, notificarCambioEstado } from '../../../../lib/notificaciones.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB } = env;
  const { id } = params;

  if (request.method !== 'PUT') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const orden = await DB.prepare(`
      SELECT ot.*, c.telefono as cliente_telefono, c.nombre as cliente_nombre
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      WHERE ot.id = ?
    `).bind(id).first();

    if (!orden) {
      return errorResponse('Orden no encontrada', 404);
    }

    if (orden.estado !== 'pendiente') {
      return errorResponse(`Solo se pueden asignar órdenes en estado "pendiente". Estado actual: "${orden.estado}"`);
    }

    const data = await request.json();
    const { tecnico_id, notas } = data;

    if (!tecnico_id) {
      return errorResponse('tecnico_id es requerido');
    }

    // Verify technician exists and is active
    const tecnico = await DB.prepare(
      'SELECT * FROM Tecnicos WHERE id = ? AND activo = 1'
    ).bind(tecnico_id).first();

    if (!tecnico) {
      return errorResponse('Técnico no encontrado o inactivo', 404);
    }

    // Verify technician belongs to same user
    if (tecnico.usuario_id !== orden.usuario_id) {
      return errorResponse('El técnico no pertenece al mismo usuario');
    }

    const now = hoyISO();

    // Assign technician and change status
    await DB.prepare(`
      UPDATE OrdenesTrabajo
      SET tecnico_id = ?, estado = 'asignada', fecha_asignacion = ?,
          actualizado_en = ?
      WHERE id = ?
    `).bind(tecnico_id, now, now, id).run();

    // Record tracking
    await DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, estado_anterior, estado_nuevo,
        realizado_por, realizado_por_tipo, notas)
      VALUES (?, 'pendiente', 'asignada', 'admin', 'admin', ?)
    `).bind(id, `Técnico asignado: ${tecnico.nombre}${notas ? '. ' + notas : ''}`).run();

    // Add note
    await DB.prepare(`
      INSERT INTO NotasTrabajo (orden_id, autor, autor_tipo, contenido)
      VALUES (?, 'Sistema', 'sistema', ?)
    `).bind(id, `Orden asignada al técnico ${tecnico.nombre} (${tecnico.codigo})${notas ? '. Nota: ' + notas : ''}`).run();

    // Send notification to technician
    enviarNotificacion(env, DB, 'asignada_tecnico', parseInt(id), {
      telefono: tecnico.telefono,
      tecnico,
    }).catch(err => console.error('Notification error:', err));

    // Notify client about assignment
    if (orden.cliente_telefono) {
      notificarCambioEstado(env, DB, parseInt(id), 'asignada').catch(err => {
        console.error('Client notification error:', err);
      });
    }

    // Get updated order
    const ordenActualizada = await DB.prepare(`
      SELECT
        ot.*, t.nombre as tecnico_nombre, t.telefono as tecnico_telefono,
        t.especialidad as tecnico_especialidad
      FROM OrdenesTrabajo ot
      LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
      WHERE ot.id = ?
    `).bind(id).first();

    return jsonResponse({
      orden: ordenActualizada,
      tecnico: {
        id: tecnico.id,
        nombre: tecnico.nombre,
        telefono: tecnico.telefono,
        especialidad: tecnico.especialidad,
      },
      mensaje: `Técnico "${tecnico.nombre}" asignado exitosamente`,
    });
  } catch (error) {
    console.error('Asignar técnico error:', error);
    return errorResponse('Error asignando técnico: ' + error.message, 500);
  }
}
