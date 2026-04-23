// ============================================
// API: ELIMINAR ORDEN DE TRABAJO
// Global Pro Automotriz
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();
    const ordenId = data.orden_id;

    if (!ordenId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere el ID de la orden'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden existe
    const orden = await env.DB.prepare(`
      SELECT id, numero_orden, estado, estado_trabajo
      FROM OrdenesTrabajo
      WHERE id = ?
    `).bind(ordenId).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Cualquier orden puede ser eliminada (solo no se pueden editar las cerradas)
    // Eliminar costos adicionales asociados
    await env.DB.prepare(`DELETE FROM CostosAdicionales WHERE orden_id = ?`).bind(ordenId).run();

    // Eliminar la orden
    await env.DB.prepare(`DELETE FROM OrdenesTrabajo WHERE id = ?`).bind(ordenId).run();

    return new Response(JSON.stringify({
      success: true,
      message: `Orden #${String(orden.numero_orden).padStart(6, '0')} eliminada correctamente`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al eliminar orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
