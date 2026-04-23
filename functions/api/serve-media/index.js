// ============================================================
// BizFlow - Serve Media from R2
// GET /api/serve-media?ruta=fotos-ot/123/antes/12345.jpg
// Sirve archivos almacenados en Cloudflare R2
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../../lib/db-helpers.js';
import { servirArchivoR2 } from '../../lib/r2-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const url = new URL(request.url);
  const ruta = url.searchParams.get('ruta');

  if (!ruta) {
    return errorResponse('Parámetro "ruta" es obligatorio');
  }

  // Sanitize ruta: prevent directory traversal
  const sanitizedRuta = ruta.replace(/\.\./g, '').replace(/\\/g, '').replace(/^\/+|\/+$/g, '');

  if (!sanitizedRuta) {
    return errorResponse('Ruta inválida');
  }

  try {
    const response = await servirArchivoR2(env.MEDIA, sanitizedRuta);

    if (!response) {
      return errorResponse('Archivo no encontrado', 404);
    }

    return response;
  } catch (error) {
    console.error('Error serving media:', error);
    return errorResponse('Error al servir el archivo', 500);
  }
}

// HEAD method for checking file existence
export async function onRequestHead(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const url = new URL(request.url);
  const ruta = url.searchParams.get('ruta');

  if (!ruta) {
    return errorResponse('Parámetro "ruta" es obligatorio');
  }

  const sanitizedRuta = ruta.replace(/\.\./g, '').replace(/\\/g, '').replace(/^\/+|\/+$/g, '');

  try {
    const objeto = await env.MEDIA.head(sanitizedRuta);
    if (!objeto) {
      return errorResponse('Archivo no encontrado', 404);
    }

    return new Response(null, {
      headers: {
        'Content-Type': objeto.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Length': objeto.size.toString(),
        'ETag': objeto.httpEtag,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    return errorResponse('Archivo no encontrado', 404);
  }
}
