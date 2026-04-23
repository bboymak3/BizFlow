// ============================================================
// BizFlow - Admin WhatsApp Test API
// POST: Send test WhatsApp message
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../lib/db-helpers.js';
import { enviarNotificacion } from '../../../lib/notificaciones.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env } = context;
  const { DB } = env;

  if (request.method !== 'POST') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const data = await request.json();
    const { telefono, mensaje } = data;

    if (!telefono || !telefono.trim()) {
      return errorResponse('telefono es requerido');
    }

    const testMensaje = mensaje?.trim() || '🔔 *Mensaje de Prueba - BizFlow*\n\nEste es un mensaje de prueba enviado desde la configuración de BizFlow.\n\nSi lo recibió, la integración WhatsApp está funcionando correctamente. ✅';

    // Check WhatsApp configuration
    const { ULTRAMSG_INSTANCE, ULTRAMSG_TOKEN } = env;

    if (!ULTRAMSG_INSTANCE || !ULTRAMSG_TOKEN) {
      return errorResponse('WhatsApp no está configurado. Configure ULTRAMSG_INSTANCE y ULTRAMSG_TOKEN en las variables de entorno.', 400);
    }

    // Send via UltraMsg API
    const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}/messages/chat`;
    const body = new URLSearchParams({
      token: ULTRAMSG_TOKEN,
      to: telefono.trim(),
      body: testMensaje,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const result = await response.json();

    // Log in database
    await DB.prepare(`
      INSERT INTO NotificacionesWhatsApp (destinatario, tipo, mensaje, estado_envio, error, enviado_en)
      VALUES (?, 'test', ?, ?, ?, ?)
    `).bind(
      telefono.trim(),
      testMensaje,
      result.status === 'success' ? 'enviada' : 'fallida',
      result.status !== 'success' ? (result.message || JSON.stringify(result)) : '',
      result.status === 'success' ? new Date().toISOString() : null
    ).run();

    if (result.status === 'success') {
      return jsonResponse({
        mensaje: 'Mensaje de prueba enviado exitosamente',
        destinatario: telefono.trim(),
        id_mensaje: result.id,
        data: result,
      });
    } else {
      return jsonResponse({
        mensaje: 'Error al enviar mensaje de prueba',
        error: result.message || 'Error desconocido',
        data: result,
      }, 400);
    }
  } catch (error) {
    console.error('WhatsApp test error:', error);
    return errorResponse('Error enviando mensaje de prueba: ' + error.message, 500);
  }
}
