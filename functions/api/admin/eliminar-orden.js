// ============================================================
// BizFlow - Eliminar Orden (Delete Work Order) API
// DELETE: Soft delete (estado='Eliminada') or hard delete
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

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const hardDelete = url.searchParams.get('hard') === 'true';

  if (!id) {
    return errorRes('ID de orden es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    const orden = await env.DB.prepare(
      `SELECT * FROM OrdenesTrabajo WHERE id = ?`
    ).bind(id).first();

    if (!orden) {
      return errorRes('Orden no encontrada', 404);
    }

    if (orden.estado === 'Eliminada' && !hardDelete) {
      return errorRes('La orden ya fue eliminada');
    }

    if (hardDelete) {
      // Hard delete: remove from all related tables
      const relatedTables = [
        'ServiciosOrden', 'CostosAdicionales', 'Pagos',
        'FotosTrabajo', 'NotasTrabajo', 'SeguimientoOT',
        'NotificacionesWhatsApp',
      ];

      for (const table of relatedTables) {
        try {
          await env.DB.prepare(`DELETE FROM ${table} WHERE orden_id = ?`).bind(id).run();
        } catch {
          // Table might not exist, that's fine
        }
      }

      // Delete the order itself
      await env.DB.prepare(`DELETE FROM OrdenesTrabajo WHERE id = ?`).bind(id).run();

      return successRes({
        deleted: true,
        id: parseInt(id),
        mode: 'hard',
      });
    } else {
      // Soft delete: set estado to 'Eliminada'
      const columns = await getColumnas(env, 'OrdenesTrabajo');
      const now = chileNowISO();

      const updates = ["estado = 'Eliminada'"];
      const params = [];

      if (columns.includes('updated_at')) { updates.push('updated_at = ?'); params.push(now); }
      if (columns.includes('fecha_actualizacion')) { updates.push('fecha_actualizacion = ?'); params.push(now); }
      if (columns.includes('fecha_eliminacion')) { updates.push('fecha_eliminacion = ?'); params.push(now); }

      params.push(id);

      await env.DB.prepare(
        `UPDATE OrdenesTrabajo SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...params).run();

      return successRes({
        deleted: true,
        id: parseInt(id),
        mode: 'soft',
        estado: 'Eliminada',
      });
    }
  } catch (error) {
    console.error('Eliminar orden error:', error);
    return errorRes('Error eliminando orden: ' + error.message, 500);
  }
}
