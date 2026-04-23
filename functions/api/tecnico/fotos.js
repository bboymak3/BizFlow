// ============================================
// API: OBTENER FOTOS DE UNA ORDEN
// Global Pro Automotriz
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const ordenId = url.searchParams.get('orden_id');

    if (!ordenId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta ID de la orden'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Obtener fotos de la orden
    const fotos = await env.DB.prepare(`
      SELECT id, tipo_foto, url_imagen, descripcion, fecha_subida
      FROM FotosTrabajo
      WHERE orden_id = ?
      ORDER BY fecha_subida ASC
    `).bind(ordenId).all();

    return new Response(JSON.stringify({
      success: true,
      fotos: fotos.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener fotos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
