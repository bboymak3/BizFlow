// ============================================
// API: OBTENER DETALLE DE UNA ORDEN
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes, getColumnas } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);
    const otCols = await getColumnas(env, 'OrdenesTrabajo');

    // Solo seleccionar columnas que existen en la tabla
    const wanted = [
      'id','numero','numero_orden','token','patente_placa',
      'cliente_id','vehiculo_id','tecnico_asignado_id',
      'fecha_ingreso','hora_ingreso','recepcionista',
      'marca','modelo','anio','cilindrada','combustible','kilometraje',
      'direccion',
      'trabajo_frenos','detalle_frenos','trabajo_luces','detalle_luces',
      'trabajo_tren_delantero','detalle_tren_delantero',
      'trabajo_correas','detalle_correas','trabajo_componentes','detalle_componentes',
      'nivel_combustible',
      'check_paragolfe_delantero_der','check_puerta_delantera_der',
      'check_puerta_trasera_der','check_paragolfe_trasero_izq','check_otros_carroceria',
      'monto_total','monto_abono','monto_restante',
      'metodo_pago','estado','estado_trabajo','es_express','pagado',
      'firma_imagen','notas'
    ];
    const safeCols = wanted.filter(c => otCols.includes(c));

    const url = new URL(request.url);
    const ordenId = url.searchParams.get('id');
    const tecnicoId = url.searchParams.get('tecnico_id');

    if (!ordenId || !tecnicoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan parámetros: id y tecnico_id'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Solo seleccionar columnas que existen en la tabla
    const colStr = safeCols.map(c => `o.${c}`).join(', ');
    const orden = await env.DB.prepare(`
      SELECT ${colStr},
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      WHERE o.id = ? AND o.tecnico_asignado_id = ?
    `).bind(ordenId, tecnicoId).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o no asignada a este técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    return new Response(JSON.stringify({
      success: true,
      orden: orden
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
