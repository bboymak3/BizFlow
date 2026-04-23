// ============================================================
// BizFlow - Editar Orden (Edit Work Order) API
// PUT: Update existing order fields
// ============================================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  chileNowISO,
  asegurarColumnasFaltantes,
  getColumnas,
} from '../../lib/db-helpers.js';
import { enviarNotificacionOrden } from '../../lib/notificaciones.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPut(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const { id, ...fields } = data;

  if (!id) {
    return errorRes('ID de orden es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Load existing order
    const orden = await env.DB.prepare(
      `SELECT * FROM OrdenesTrabajo WHERE id = ?`
    ).bind(id).first();

    if (!orden) {
      return errorRes('Orden no encontrada', 404);
    }

    const isClosed = orden.estado === 'Cerrada' || orden.estado === 'cerrada';
    const isCancelled = orden.estado === 'Cancelada';
    const isDeleted = orden.estado === 'Eliminada';

    // Don't allow editing deleted orders
    if (isDeleted) {
      return errorRes('No se puede editar una orden eliminada');
    }

    // Get available columns
    const columns = await getColumnas(env, 'OrdenesTrabajo');

    // Allowed fields for editing
    const allowedFields = [
      'estado', 'estado_trabajo', 'tecnico_asignado_id',
      'monto_base', 'mano_obra', 'descuento', 'monto_final',
      'metodo_pago', 'abono', 'restante',
      'urgencia', 'notas', 'direccion',
      'cliente_nombre', 'cliente_telefono', 'cliente_email',
      'marca', 'modelo', 'anio', 'color', 'patente',
      'cerrada_por', 'fecha_cierre',
    ];

    // For closed/cancelled orders, only allow reactivation
    if (isClosed || isCancelled) {
      const allowedReactivation = ['estado', 'estado_trabajo', 'notas'];
      const tryingToReactivate = fields.estado && fields.estado !== 'Cerrada' && fields.estado !== 'Cancelada';

      if (!tryingToReactivate) {
        return errorRes('Orden cerrada/cancelada. Solo se puede reactivar cambiando el estado.');
      }

      // Only allow reactivation fields
      const updateKeys = Object.keys(fields).filter(k => allowedReactivation.includes(k));
      if (updateKeys.length === 0) {
        return errorRes('No hay campos permitidos para editar en esta orden');
      }
    }

    // Build update query
    const updates = [];
    const params = [];
    let estadoChanged = false;
    let estadoTrabajoChanged = false;
    let tecnicoChanged = false;

    for (const [key, value] of Object.entries(fields)) {
      if (!allowedFields.includes(key)) continue;
      if (!columns.includes(key)) continue;

      if (key === 'estado' && value !== orden.estado) estadoChanged = true;
      if (key === 'estado_trabajo' && value !== orden.estado_trabajo) estadoTrabajoChanged = true;
      if (key === 'tecnico_asignado_id' && value !== orden.tecnico_asignado_id) tecnicoChanged = true;

      updates.push(`${key} = ?`);
      params.push(value);
    }

    if (updates.length === 0) {
      return errorRes('No hay campos válidos para actualizar');
    }

    // Auto-calculate monto_final if financial fields changed
    if (fields.monto_base !== undefined || fields.mano_obra !== undefined || fields.descuento !== undefined) {
      const base = parseFloat(fields.monto_base ?? orden.monto_base) || 0;
      const mano = parseFloat(fields.mano_obra ?? orden.mano_obra) || 0;
      const desc = parseFloat(fields.descuento ?? orden.descuento) || 0;
      const finalAmount = Math.max(0, base + mano - desc);

      if (columns.includes('monto_final') && !fields.monto_final) {
        updates.push('monto_final = ?');
        params.push(finalAmount);
      }
      if (columns.includes('restante')) {
        const abono = parseFloat(fields.abono ?? orden.abono) || 0;
        updates.push('restante = ?');
        params.push(Math.max(0, finalAmount - abono));
      }
    }

    // Set updated_at
    if (columns.includes('updated_at')) {
      updates.push('updated_at = ?');
      params.push(chileNowISO());
    }
    if (columns.includes('fecha_actualizacion')) {
      updates.push('fecha_actualizacion = ?');
      params.push(chileNowISO());
    }

    params.push(id);

    await env.DB.prepare(
      `UPDATE OrdenesTrabajo SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    // Create tracking record
    if ((estadoChanged || estadoTrabajoChanged) && columns.includes('id')) {
      try {
        const segCols = await getColumnas(env, 'SeguimientoOT');
        if (segCols.length > 0) {
          await env.DB.prepare(
            `INSERT INTO SeguimientoOT (orden_id, estado_anterior, estado_nuevo, tecnico_id, observacion, negocio_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            id,
            estadoChanged ? orden.estado : null,
            estadoChanged ? fields.estado : null,
            fields.tecnico_asignado_id || orden.tecnico_asignado_id || null,
            fields.notas || null,
            orden.negocio_id || 1,
            chileNowISO()
          ).run();
        }
      } catch (trackError) {
        console.error('Tracking record error:', trackError);
      }
    }

    // Send notifications for state changes
    if (estadoChanged || estadoTrabajoChanged || tecnicoChanged) {
      let tipoEvento = null;
      const newEstado = fields.estado || orden.estado;
      const newEstadoTrabajo = fields.estado_trabajo || orden.estado_trabajo;

      if (newEstado === 'Aprobada' && tecnicoChanged) tipoEvento = 'orden_asignada';
      else if (newEstadoTrabajo === 'En Proceso' || newEstadoTrabajo === 'en_progreso') tipoEvento = 'en_progreso';
      else if (newEstado === 'Cerrada' || newEstado === 'cerrada') tipoEvento = 'cerrada';
      else if (newEstadoTrabajo === 'Completada') tipoEvento = 'completada';

      if (tipoEvento) {
        enviarNotificacionOrden(env, id, tipoEvento).catch(err => {
          console.error('Notification error on edit:', err);
        });
      }
    }

    // Return updated order
    const updatedOrden = await env.DB.prepare(
      `SELECT * FROM OrdenesTrabajo WHERE id = ?`
    ).bind(id).first();

    return successRes(updatedOrden);
  } catch (error) {
    console.error('Editar orden error:', error);
    return errorRes('Error editando orden: ' + error.message, 500);
  }
}
