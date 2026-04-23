// ============================================
// BIZFLOW - Close Order
// POST /api/tecnico/cerrar-orden
// Cerrar completamente una orden de trabajo
// ============================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  validateRequired,
  successResponse,
  errorResponse,
  chileNowStr,
  getConfig,
  sendWhatsApp,
  generarMensajeWhatsApp,
} from '../../lib/db-helpers.js';

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await parseBody(request);

  if (!body) {
    return errorResponse('Body de la petición inválido');
  }

  const { valid, missing } = validateRequired(body, ['orden_id', 'tecnico_id']);
  if (!valid) {
    return errorResponse(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  const { orden_id, tecnico_id, notas, estado_pago, metodo_pago } = body;
  const now = chileNowStr();

  try {
    // 1. Get current order
    const orden = await env.DB.prepare(`
      SELECT * FROM OrdenesTrabajo WHERE id = ?
    `).bind(parseInt(orden_id)).first();

    if (!orden) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // 2. Verify technician assignment
    if (orden.tecnico_asignado_id !== parseInt(tecnico_id)) {
      return errorResponse('Esta orden no está asignada a este técnico', 403);
    }

    // 3. Check if order can be closed (must be Completada or No Completada)
    const estadosPermitidos = ['Completada', 'No Completada', 'Cerrada'];
    if (!estadosPermitidos.includes(orden.estado_trabajo)) {
      return errorResponse(
        `La orden no puede ser cerrada. Estado actual: "${orden.estado_trabajo}". ` +
        `Debe estar en: ${estadosPermitidos.join(', ')}`
      );
    }

    // 4. Build update clauses
    const updateClauses = ['estado_trabajo = ?', 'estado = ?'];
    const updateParams = ['Cerrada', 'Cerrada'];

    // Save closing notes
    if (notas) {
      // Append to existing notes
      const existingNotas = orden.notas ? orden.notas + '\n\n' : '';
      updateClauses.push('notas = ?');
      updateParams.push(`${existingNotas}[CIERRE - ${now}]\n${notas}`);
    }

    // Save payment status and method
    if (estado_pago) {
      updateClauses.push('estado_pago = ?');
      updateParams.push(estado_pago);
    }
    if (metodo_pago) {
      updateClauses.push('metodo_pago = ?');
      updateParams.push(metodo_pago);
    }

    // Set close timestamp
    updateClauses.push('fecha_completado = ?');
    updateParams.push(now);

    // 5. Execute update
    updateParams.push(parseInt(orden_id));
    const sqlUpdate = `UPDATE OrdenesTrabajo SET ${updateClauses.join(', ')} WHERE id = ?`;
    await env.DB.prepare(sqlUpdate).bind(...updateParams).run();

    // 6. Insert tracking record
    await env.DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, tecnico_id, estado_anterior, estado_nuevo, observaciones, fecha_evento)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      parseInt(orden_id),
      parseInt(tecnico_id),
      orden.estado_trabajo,
      'Cerrada',
      notas || 'Orden cerrada por técnico',
      now
    ).run();

    // 7. If there are additional notes, save them as a work note too
    if (notas) {
      await env.DB.prepare(`
        INSERT INTO NotasTrabajo (orden_id, tecnico_id, nota, fecha_nota)
        VALUES (?, ?, ?, ?)
      `).bind(
        parseInt(orden_id),
        parseInt(tecnico_id),
        `[CIERRE] ${notas}`,
        now
      ).run();
    }

    // 8. Send WhatsApp notification
    const tecnico = await env.DB.prepare(`
      SELECT nombre FROM Tecnicos WHERE id = ?
    `).bind(parseInt(tecnico_id)).first();

    const cliente = await env.DB.prepare(`
      SELECT nombre, telefono FROM Clientes WHERE id = ?
    `).bind(orden.cliente_id).first();

    if (cliente?.telefono) {
      const config = await getConfig(env.DB);
      const mensaje = generarMensajeWhatsApp('cerrada', orden, tecnico, cliente);
      await sendWhatsApp(env.DB, config, {
        orden_id: parseInt(orden_id),
        telefono: cliente.telefono,
        mensaje,
        tipo_evento: 'cerrada',
        negocio_id: orden.negocio_id,
      });
    }

    return successResponse({
      orden_id: parseInt(orden_id),
      estado_anterior: orden.estado_trabajo,
      estado_nuevo: 'Cerrada',
      fecha_cierre: now,
      mensaje: 'Orden cerrada exitosamente',
    });
  } catch (error) {
    console.error('Error closing order:', error);
    return errorResponse('Error al cerrar la orden de trabajo', 500);
  }
}
