// ============================================
// API: APROBAR ORDEN (GUARDAR FIRMA)
// Global Pro Automotriz
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.token || !data.firma) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: token y firma'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden existe y está en estado "Enviada"
    const orden = await env.DB.prepare(
      "SELECT * FROM OrdenesTrabajo WHERE token = ? AND estado = 'Enviada'"
    ).bind(data.token).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o ya procesada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Actualizar orden con firma y cambiar estado
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET estado = 'Aprobada',
          firma_imagen = ?,
          fecha_aprobacion = datetime('now', 'localtime'),
          aprobado_por = 'Cliente'
      WHERE token = ?
    `).bind(data.firma, data.token).run();

    // Obtener orden actualizada
    const ordenActualizada = await env.DB.prepare(`
      SELECT
        o.id, o.numero_orden, o.token, o.estado, o.patente_placa, o.marca, o.modelo,
        o.fecha_ingreso, o.hora_ingreso, o.recepcionista, o.firma_imagen, o.fecha_aprobacion,
        o.monto_total, o.monto_abono, o.monto_restante, o.cliente_id, o.vehiculo_id,
        o.servicios_seleccionados, o.diagnostico_checks, o.diagnostico_observaciones,
        c.nombre as cliente_nombre,
        c.rut as cliente_rut,
        c.telefono as cliente_telefono
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      WHERE o.token = ?
    `).bind(data.token).first();

    return new Response(JSON.stringify({
      success: true,
      orden: ordenActualizada
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al aprobar orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
