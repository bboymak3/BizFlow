// ============================================================
// BizFlow - UltraMsg WhatsApp Config API
// GET: get current config from Configuracion table
// POST: save UltraMsg config
// POST: test connection (send test message)
// ============================================================

import {
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  chileNowISO,
  asegurarColumnasFaltantes,
  getConfig,
  getColumnas,
} from '../../lib/db-helpers.js';
import { enviarWhatsAppUltraMsg, normalizarTelefonoChile } from '../../lib/notificaciones.js';

export async function onRequestOptions() {
  return handleOptions();
}

// GET - Get current UltraMsg config
export async function onRequestGet(context) {
  const { env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const config = await getConfig(env.DB);

    // Mask the token for security
    const token = config.whatsapp_ultramsg_token || config.ultramsg_token || '';
    const maskedToken = token
      ? token.substring(0, 4) + '****' + token.substring(token.length - 4)
      : '';

    return successRes({
      instance: config.whatsapp_ultramsg_instance || config.ultramsg_instance || '',
      token_masked: maskedToken,
      token_configured: !!token,
      instance_configured: !!(config.whatsapp_ultramsg_instance || config.ultramsg_instance),
      fully_configured: !!(token && (config.whatsapp_ultramsg_instance || config.ultramsg_instance)),
    });
  } catch (error) {
    console.error('UltraMsg config get error:', error);
    return errorRes('Error obteniendo configuración: ' + error.message, 500);
  }
}

// POST - Save config or test connection
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);
  const {
    accion,
    whatsapp_ultramsg_instance,
    whatsapp_ultramsg_token,
    telefono_prueba,
    mensaje_prueba,
  } = data;

  if (!accion) {
    return errorRes('Acción es requerida (guardar, probar)');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Get available columns
    const confCols = await getColumnas(env, 'Configuracion');

    if (accion === 'guardar') {
      const updates = [];
      const params = [];

      // Handle both old and new column names
      if (whatsapp_ultramsg_instance !== undefined) {
        if (confCols.includes('whatsapp_ultramsg_instance')) {
          updates.push('whatsapp_ultramsg_instance = ?');
          params.push(whatsapp_ultramsg_instance.trim());
        }
        if (confCols.includes('ultramsg_instance')) {
          updates.push('ultramsg_instance = ?');
          params.push(whatsapp_ultramsg_instance.trim());
        }
      }

      if (whatsapp_ultramsg_token !== undefined) {
        if (confCols.includes('whatsapp_ultramsg_token')) {
          updates.push('whatsapp_ultramsg_token = ?');
          params.push(whatsapp_ultramsg_token.trim());
        }
        if (confCols.includes('ultramsg_token')) {
          updates.push('ultramsg_token = ?');
          params.push(whatsapp_ultramsg_token.trim());
        }
      }

      if (updates.length === 0) {
        return errorRes('No hay campos para actualizar');
      }

      if (confCols.includes('updated_at')) {
        updates.push('updated_at = ?');
        params.push(chileNowISO());
      }

      params.push(1); // WHERE id = 1

      await env.DB.prepare(
        `UPDATE Configuracion SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...params).run();

      const config = await getConfig(env.DB);
      const token = config.whatsapp_ultramsg_token || config.ultramsg_token || '';
      const maskedToken = token
        ? token.substring(0, 4) + '****' + token.substring(token.length - 4)
        : '';

      return successRes({
        guardado: true,
        instance_configured: !!(config.whatsapp_ultramsg_instance || config.ultramsg_instance),
        token_configured: !!token,
        token_masked: maskedToken,
      });
    }

    if (accion === 'probar') {
      // Load current config
      const config = await getConfig(env.DB);
      const instance = config.whatsapp_ultramsg_instance || config.ultramsg_instance || whatsapp_ultramsg_instance;
      const token = config.whatsapp_ultramsg_token || config.ultramsg_token || whatsapp_ultramsg_token;

      if (!instance || !token) {
        return errorRes('UltraMsg no está configurado. Guarde la instance y token primero.');
      }

      const testPhone = telefono_prueba || '';
      if (!testPhone) {
        return errorRes('Teléfono de prueba es requerido para probar la conexión');
      }

      const normalizedPhone = normalizarTelefonoChile(testPhone);
      if (!normalizedPhone) {
        return errorRes('Teléfono de prueba inválido. Formato esperado: 56912345678');
      }

      const testMessage = mensaje_prueba || '🧪 *Mensaje de Prueba - BizFlow*\n\nEste es un mensaje de prueba para verificar la conexión con UltraMsg.\n\nSi recibiste este mensaje, la configuración es correcta. ✅';

      const result = await enviarWhatsAppUltraMsg(normalizedPhone, testMessage, instance, token);

      if (result.success) {
        return successRes({
          exito: true,
          message_id: result.message_id,
          telefono: normalizedPhone,
          mensaje: testMessage,
        });
      }

      return errorRes(`Error enviando mensaje de prueba: ${result.error}`, 400);
    }

    return errorRes(`Acción no reconocida: ${accion}`);
  } catch (error) {
    console.error('UltraMsg config post error:', error);
    return errorRes('Error procesando configuración: ' + error.message, 500);
  }
}
