// ============================================================
// BizFlow - Órdenes Disponibles API
// GET: List orders where estado='Aprobada' AND no technician assigned
// ============================================================

import {
  handleOptions,
  successRes,
  errorRes,
  asegurarColumnasFaltantes,
} from '../../lib/db-helpers.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const result = await env.DB.prepare(`
      SELECT
        ot.id,
        ot.numero_orden,
        ot.patente_placa as patente,
        ot.marca,
        ot.modelo,
        ot.anio,
        ot.estado,
        ot.estado_trabajo,
        ot.monto_total,
        ot.monto_final,
        ot.monto_base,
        ot.fecha_creacion,
        ot.fecha_ingreso,
        ot.direccion,
        ot.notas,
        ot.prioridad,
        ot.es_express as express,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        c.email as cliente_email,
        c.direccion as cliente_direccion
      FROM OrdenesTrabajo ot
      LEFT JOIN Clientes c ON ot.cliente_id = c.id
      WHERE ot.estado = 'Aprobada'
        AND ot.tecnico_asignado_id IS NULL
        AND (ot.estado != 'Eliminada' OR ot.estado IS NULL)
      ORDER BY
        CASE WHEN ot.es_express = 1 THEN 0 ELSE 1 END,
        ot.fecha_creacion DESC
    `).all();

    return successRes(result.results || []);
  } catch (error) {
    console.error('Órdenes disponibles error:', error);
    return errorRes('Error obteniendo órdenes disponibles: ' + error.message, 500);
  }
}
