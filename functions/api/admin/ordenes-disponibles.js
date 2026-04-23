// ============================================
// API: ÓRDENES DISPONIBLES PARA ASIGNACIÓN
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const ordenes = await env.DB.prepare(
      `SELECT o.id, o.numero_orden, o.patente_placa, o.cliente_nombre,
              o.fecha_ingreso as fecha_creacion
       FROM OrdenesTrabajo o
       WHERE o.estado = 'Aprobada' AND (o.tecnico_asignado_id IS NULL OR o.tecnico_asignado_id = '')
       ORDER BY o.fecha_ingreso DESC`
    ).all();

    return new Response(JSON.stringify({
      success: true,
      ordenes: ordenes.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener órdenes disponibles:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
