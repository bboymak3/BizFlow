// ============================================
// BIZFLOW - Get Photos for Order (R2)
// GET /api/tecnico/fotos?orden_id=X&include_urls=true
// Obtiene fotos de una orden con URLs de R2
// ============================================

import { jsonResponse, errorResponse, handleCors } from '../../lib/db-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const url = new URL(request.url);
  const ordenId = url.searchParams.get('orden_id');

  if (!ordenId) {
    return errorResponse('Parámetro orden_id es obligatorio');
  }

  try {
    // Get all photo metadata for this order (NO base64, just R2 URLs)
    const fotos = await env.DB.prepare(`
      SELECT
        ft.id,
        ft.orden_id,
        ft.tipo,
        ft.descripcion,
        ft.ruta_r2,
        ft.url_publica,
        ft.subida_por,
        ft.mime_type,
        ft.tamano_bytes,
        ft.creado_en,
        t.nombre AS tecnico_nombre
      FROM FotosTrabajo ft
      LEFT JOIN Tecnicos t ON ft.subida_por = 'tecnico'
      WHERE ft.orden_id = ?
      ORDER BY
        CASE ft.tipo
          WHEN 'antes' THEN 1
          WHEN 'diagnostico' THEN 2
          WHEN 'durante' THEN 3
          WHEN 'repuesto' THEN 4
          WHEN 'final' THEN 5
          WHEN 'despues' THEN 6
          ELSE 7
        END,
        ft.creado_en ASC
    `).bind(parseInt(ordenId)).all();

    // Build photo objects with display URLs
    const fotosList = (fotos.results || []).map(foto => ({
      id: foto.id,
      orden_id: foto.orden_id,
      tipo: foto.tipo,
      descripcion: foto.descripcion,
      url: foto.url_publica || `/api/serve-media?ruta=${encodeURIComponent(foto.ruta_r2)}`,
      thumbnail_url: foto.url_publica || `/api/serve-media?ruta=${encodeURIComponent(foto.ruta_r2)}`,
      subida_por: foto.subida_por,
      mime_type: foto.mime_type,
      tamano_bytes: foto.tamano_bytes,
      fecha: foto.creado_en,
      tecnico_nombre: foto.tecnico_nombre,
    }));

    // Group by type
    const agrupadas = {
      antes: [],
      diagnostico: [],
      durante: [],
      repuesto: [],
      final: [],
      despues: [],
      otra: [],
    };

    for (const foto of fotosList) {
      const tipo = foto.tipo || 'otra';
      if (agrupadas[tipo]) {
        agrupadas[tipo].push(foto);
      } else {
        agrupadas.otra.push(foto);
      }
    }

    // Stats
    const stats = {
      total: fotosList.length,
      por_tipo: Object.fromEntries(
        Object.entries(agrupadas).map(([k, v]) => [k, v.length])
      ),
      tamano_total_mb: (
        fotosList.reduce((sum, f) => sum + (f.tamano_bytes || 0), 0) / 1024 / 1024
      ).toFixed(2),
    };

    return jsonResponse({
      fotos: fotosList,
      agrupadas,
      stats,
    });

  } catch (error) {
    console.error('Error fetching photos:', error);
    return errorResponse('Error al obtener las fotos: ' + error.message, 500);
  }
}
