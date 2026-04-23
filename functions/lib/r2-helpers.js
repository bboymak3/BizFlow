// ============================================================
// BizFlow - R2 Helpers
// Almacenamiento y recuperación de medios en Cloudflare R2
// Bucket: my-emdash-media (binding: MEDIA)
// ============================================================

// Subir un archivo a R2
// @param {R2Bucket} MEDIA - Binding de R2
// @param {string} ruta - Ruta dentro del bucket (ej: "fotos-ot/123/antes/photo1.jpg")
// @param {ArrayBuffer|ReadableStream} datos - Contenido del archivo
// @param {object} opciones - { contentType, metadata }
// @returns {object} - { ruta, urlPublica, size }
export async function subirArchivoR2(MEDIA, ruta, datos, opciones = {}) {
  const {
    contentType = 'image/jpeg',
    metadata = {},
    customHeaders = {}
  } = opciones;

  await MEDIA.put(ruta, datos, {
    httpMetadata: { contentType },
    customMetadata: {
      subido_en: new Date().toISOString(),
      ...metadata
    },
    ...customHeaders
  });

  return {
    ruta,
    // La URL pública se construye usando R2 public access o un Worker
    urlPublica: `/api/serve-media?ruta=${encodeURIComponent(ruta)}`,
    size: datos instanceof ArrayBuffer ? datos.byteLength : 0
  };
}

// Obtener un archivo de R2
// @param {R2Bucket} MEDIA
// @param {string} ruta
// @returns {R2ObjectBody|null}
export async function obtenerArchivoR2(MEDIA, ruta) {
  return await MEDIA.get(ruta);
}

// Eliminar un archivo de R2
// @param {R2Bucket} MEDIA
// @param {string} ruta
// @returns {boolean}
export async function eliminarArchivoR2(MEDIA, ruta) {
  await MEDIA.delete(ruta);
  return true;
}

// Listar archivos en un prefijo de R2
// @param {R2Bucket} MEDIA
// @param {string} prefijo
// @param {number} limite
// @returns {R2Objects}
export async function listarArchivosR2(MEDIA, prefijo, limite = 100) {
  return await MEDIA.list({
    prefix: prefijo,
    limit: limite
  });
}

// Generar ruta para foto de OT
// @param {number} ordenId
// @param {string} tipo - 'antes', 'durante', 'despues', 'evidencia', 'diagnostico', 'firma'
// @param {string} extension - 'jpg', 'png', etc.
// @returns {string}
export function generarRutaFotoOT(ordenId, tipo, extension = 'jpg') {
  const timestamp = Date.now();
  return `fotos-ot/${ordenId}/${tipo}/${timestamp}.${extension}`;
}

// Generar ruta para firma digital
// @param {number} ordenId
// @param {string} tipo - 'cliente', 'tecnico'
// @returns {string}
export function generarRutaFirma(ordenId, tipo) {
  const timestamp = Date.now();
  return `firmas/${ordenId}/${tipo}_${timestamp}.png`;
}

// Generar ruta para avatar
// @param {number} usuarioId
// @param {string} extension
// @returns {string}
export function generarRutaAvatar(usuarioId, extension = 'jpg') {
  return `avatares/${usuarioId}_${Date.now()}.${extension}`;
}

// Generar ruta para landing page
// @param {number} landingId
// @param {string} tipo - 'logo', 'favicon', 'bg', 'imagen'
// @param {string} extension
// @returns {string}
export function generarRutaLanding(landingId, tipo, extension = 'jpg') {
  return `landing-pages/${landingId}/${tipo}_${Date.now()}.${extension}`;
}

// Generar ruta para documento/comprobante
// @param {string} tipo - 'comprobante', 'documento'
// @param {string} nombre
// @returns {string}
export function generarRutaDocumento(tipo, nombre) {
  return `documentos/${tipo}/${Date.now()}_${nombre}`;
}

// Convertir base64 a ArrayBuffer
// @param {string} base64 - Base64 string (puede incluir data:image/...;base64, prefix)
// @returns {ArrayBuffer}
export function base64ToArrayBuffer(base64) {
  // Remover prefijo data:image/...;base64, si existe
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '').replace(/^data:application\/\w+;base64,/, '');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Servir archivo R2 como respuesta HTTP
// @param {R2Bucket} MEDIA
// @param {string} ruta
// @returns {Response|null}
export async function servirArchivoR2(MEDIA, ruta) {
  const objeto = await MEDIA.get(ruta);
  if (!objeto) return null;

  const headers = new Headers();
  headers.set('Content-Type', objeto.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Length', objeto.size.toString());
  headers.set('Cache-Control', 'public, max-age=31536000');
  headers.set('ETag', objeto.httpEtag);

  return new Response(objeto.body, { headers });
}

// Subir múltiples fotos a R2 (batch)
// @param {R2Bucket} MEDIA
// @param {Array} fotos - [{ base64, tipo, extension, ordenId }]
// @returns {Array} - [{ ruta, urlPublica }]
export async function subirMultiplesFotos(MEDIA, fotos) {
  const resultados = [];
  for (const foto of fotos) {
    const { base64, tipo, extension = 'jpg', ordenId } = foto;
    const ruta = generarRutaFotoOT(ordenId, tipo, extension);
    const buffer = base64ToArrayBuffer(base64);

    await MEDIA.put(ruta, buffer, {
      httpMetadata: { contentType: `image/${extension}` },
      customMetadata: {
        tipo,
        orden_id: ordenId.toString(),
        subido_en: new Date().toISOString()
      }
    });

    resultados.push({
      ruta,
      urlPublica: `/api/serve-media?ruta=${encodeURIComponent(ruta)}`,
      size: buffer.byteLength
    });
  }
  return resultados;
}
