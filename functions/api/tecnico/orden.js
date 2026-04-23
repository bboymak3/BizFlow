// ============================================
// API: OBTENER DETALLE DE UNA ORDEN
// Global Pro Automotriz
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
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

    // Verificar que la orden esté asignada a este técnico
    const orden = await env.DB.prepare(`
      SELECT
        o.id, o.numero, o.numero_orden, o.token, o.patente_placa,
        o.cliente_id, o.vehiculo_id, o.tecnico_asignado_id,
        o.fecha_ingreso, o.hora_ingreso, o.recepcionista,
        o.marca, o.modelo, o.anio, o.cilindrada, o.combustible, o.kilometraje,
        o.direccion, o.referencia_direccion,
        o.trabajo_frenos, o.detalle_frenos,
        o.trabajo_luces, o.detalle_luces,
        o.trabajo_tren_delantero, o.detalle_tren_delantero,
        o.trabajo_correas, o.detalle_correas,
        o.trabajo_componentes, o.detalle_componentes,
        o.nivel_combustible,
        o.check_paragolfe_delantero_der, o.check_puerta_delantera_der,
        o.check_puerta_trasera_der, o.check_paragolfe_trasero_izq, o.check_otros_carroceria,
        o.monto_total, o.monto_abono, o.monto_restante,
        o.monto_base, o.mano_obra, o.descuento, o.monto_final,
        o.metodo_pago, o.estado, o.estado_trabajo,
        o.es_express, o.pagado,
        o.firma_imagen, o.fecha_aprobacion, o.fecha_creacion, o.fecha_completado,
        o.diagnostico_checks, o.diagnostico_observaciones,
        o.servicios_seleccionados, o.notas,
        o.distancia_km, o.cargo_domicilio, o.domicilio_modo_cobro,
        o.fecha_programada, o.hora_programada,
        o.cliente_nombre as ot_cliente_nombre, o.cliente_telefono as ot_cliente_telefono,
        o.cliente_email, o.cliente_rut as ot_cliente_rut,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        c.rut as cliente_rut
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
