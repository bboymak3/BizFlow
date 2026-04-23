// ============================================
// API: SUBIR FOTO DE TRABAJO
// Global Pro Automotriz
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id || !data.tipo_foto || !data.imagen) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id, tecnico_id, tipo_foto e imagen'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden está asignada a este técnico
    const orden = await env.DB.prepare(
      "SELECT id FROM OrdenesTrabajo WHERE id = ? AND tecnico_asignado_id = ?"
    ).bind(data.orden_id, data.tecnico_id).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o no asignada a este técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // En producción, aquí se subiría a Cloudflare R2
    // Por ahora, guardamos el base64 directamente (limitado)
    const urlImagen = data.imagen; // En producción: URL de R2

    // Guardar en base de datos
    await env.DB.prepare(`
      INSERT INTO FotosTrabajo (orden_id, tecnico_id, tipo_foto, url_imagen, descripcion)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.orden_id,
      data.tecnico_id,
      data.tipo_foto,
      urlImagen,
      data.descripcion || null
    ).run();

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Foto guardada correctamente'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al subir foto:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
