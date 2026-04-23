// ============================================================
// BizFlow - WhatsApp Notification Utilities
// UltraMsg API integration + fallback wa.me links
// ============================================================

import { chileDate, chileNowISO } from './db-helpers.js';

/**
 * Send WhatsApp message via UltraMsg API
 * @param {string} phone - Destination phone number
 * @param {string} message - Message text
 * @param {string} instance - UltraMsg instance ID
 * @param {string} token - UltraMsg API token
 * @returns {Promise<{success: boolean, message_id: string|null, error: string|null}>}
 */
export async function enviarWhatsAppUltraMsg(phone, message, instance, token) {
  if (!instance || !token) {
    return { success: false, message_id: null, error: 'UltraMsg no configurado (instance/token faltantes)' };
  }

  const normalizedPhone = normalizarTelefonoChile(phone);
  if (!normalizedPhone) {
    return { success: false, message_id: null, error: 'Teléfono inválido' };
  }

  try {
    const url = `https://api.ultramsg.com/${instance}/messages/chat`;

    const formData = new URLSearchParams();
    formData.append('token', token);
    formData.append('to', normalizedPhone);
    formData.append('body', message);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, message_id: null, error: `UltraMsg HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();

    if (data.status === 'success' || data.sent === true) {
      return {
        success: true,
        message_id: data.id || null,
        error: null,
      };
    }

    return {
      success: false,
      message_id: data.id || null,
      error: data.message || data.reason || 'Error desconocido de UltraMsg',
    };
  } catch (error) {
    console.error('UltraMsg send error:', error);
    return { success: false, message_id: null, error: error.message || 'Error de conexión con UltraMsg' };
  }
}

/**
 * Normalize a Chilean phone number to 569XXXXXXXX format
 * Handles: +56912345678, 56912345678, 912345678, +56 9 1234 5678, etc.
 * @param {string} phone - Phone number in any format
 * @returns {string|null} Normalized number or null if invalid
 */
export function normalizarTelefonoChile(phone) {
  if (!phone) return null;

  // Remove all non-digit characters
  let digits = phone.replace(/[^\d]/g, '');

  // Handle +56 prefix
  if (digits.startsWith('56') && digits.length === 11) {
    return digits; // Already in correct format
  }

  // Handle 9XXXXXXXX (9 digits - mobile without country code)
  if (digits.length === 9 && digits.startsWith('9')) {
    return '56' + digits;
  }

  // Handle 8XXXXXXXX (8 digits - some old format)
  if (digits.length === 8 && digits.startsWith('8')) {
    return '569' + digits.slice(1);
  }

  // Handle with + prefix already stripped but has country code
  if (digits.length === 11 && digits.startsWith('56')) {
    return digits;
  }

  // Handle 12 digits starting with 569
  if (digits.length === 12 && digits.startsWith('569')) {
    return digits;
  }

  return null;
}

/**
 * Generate a wa.me link for fallback manual messaging
 * @param {string} phone - Phone number (will be normalized)
 * @param {string} message - Message text
 * @returns {string} wa.me URL
 */
export function generarWaMeLink(phone, message) {
  const normalized = normalizarTelefonoChile(phone) || phone;
  const encodedMessage = encodeURIComponent(message || '');
  return `https://wa.me/${normalized}?text=${encodedMessage}`;
}

/**
 * Save notification record to NotificacionesWhatsApp table
 * @param {object} env - Cloudflare env with DB
 * @param {number} ordenId - Work order ID
 * @param {string} telefono - Phone number
 * @param {string} mensaje - Message text
 * @param {string} tipoEvento - Event type
 * @returns {Promise<number>} Notification record ID
 */
export async function registrarNotificacion(env, ordenId, telefono, mensaje, tipoEvento) {
  try {
    const result = await env.DB.prepare(
      `INSERT INTO NotificacionesWhatsApp (orden_id, telefono, mensaje, tipo_evento, estado_envio, negocio_id)
       VALUES (?, ?, ?, ?, 'pendiente', 1)`
    ).bind(ordenId, telefono, mensaje, tipoEvento).run();

    return result.meta.last_row_id;
  } catch (error) {
    console.error('Error registering notification:', error);
    return 0;
  }
}

/**
 * Get UltraMsg configuration from Configuracion table
 * @param {object} env - Cloudflare env with DB
 * @returns {Promise<{instance: string, token: string, habilitado: boolean}>}
 */
async function getUltraMsgConfig(env) {
  try {
    const results = await Promise.all([
      env.DB.prepare(`SELECT valor FROM Configuracion WHERE clave = 'ultramsg_instance' LIMIT 1`).first(),
      env.DB.prepare(`SELECT valor FROM Configuracion WHERE clave = 'ultramsg_token' LIMIT 1`).first(),
      env.DB.prepare(`SELECT valor FROM Configuracion WHERE clave = 'whatsapp_habilitado' LIMIT 1`).first(),
    ]);

    return {
      instance: results[0]?.valor || '',
      token: results[1]?.valor || '',
      habilitado: results[2]?.valor === 'true' || results[2]?.valor === '1',
    };
  } catch {
    return { instance: '', token: '', habilitado: false };
  }
}

/**
 * Main notification dispatcher - sends WhatsApp notification for a work order event
 * @param {object} env - Cloudflare env with DB
 * @param {number} ordenId - Work order ID
 * @param {string} tipoEvento - Event type
 * @returns {Promise<{enviado: boolean, method: string, error: string|null}>}
 */
export async function enviarNotificacionOrden(env, ordenId, tipoEvento) {
  try {
    // Load order with client and technician data
    const orden = await env.DB.prepare(`
      SELECT
        ot.id, ot.numero_orden, ot.patente, ot.estado, ot.estado_trabajo,
        ot.monto_base, ot.mano_obra, ot.monto_final, ot.express,
        ot.cliente_nombre, ot.cliente_telefono, ot.direccion, ot.notas,
        t.nombre AS tecnico_nombre, t.telefono AS tecnico_telefono,
        e.nombre AS empresa_nombre
      FROM OrdenesTrabajo ot
      LEFT JOIN Tecnicos t ON ot.tecnico_asignado_id = t.id
      LEFT JOIN Empresas e ON ot.empresa_id = e.id
      WHERE ot.id = ?
    `).bind(ordenId).first();

    if (!orden) {
      return { enviado: false, method: 'none', error: 'Orden no encontrada' };
    }

    const config = await getUltraMsgConfig(env);

    // Determine recipient and message based on event type
    let phone = '';
    let message = '';

    switch (tipoEvento) {
      case 'orden_creada': {
        phone = orden.cliente_telefono;
        message = buildMensajeOrdenCreada(orden);
        break;
      }
      case 'orden_express': {
        phone = orden.cliente_telefono;
        message = buildMensajeOrdenExpress(orden);
        break;
      }
      case 'orden_asignada': {
        phone = orden.tecnico_telefono;
        message = buildMensajeOrdenAsignada(orden);
        break;
      }
      case 'tecnico_en_sitio': {
        phone = orden.cliente_telefono;
        message = buildMensajeTecnicoEnSitio(orden);
        break;
      }
      case 'en_progreso': {
        phone = orden.cliente_telefono;
        message = buildMensajeEnProgreso(orden);
        break;
      }
      case 'completada': {
        phone = orden.cliente_telefono;
        message = buildMensajeCompletada(orden);
        break;
      }
      case 'cerrada': {
        phone = orden.cliente_telefono;
        message = buildMensajeCerrada(orden);
        break;
      }
      default: {
        return { enviado: false, method: 'none', error: `Tipo de evento desconocido: ${tipoEvento}` };
      }
    }

    if (!phone) {
      return { enviado: false, method: 'none', error: 'No hay teléfono destino' };
    }

    // Register notification in DB
    const notifId = await registrarNotificacion(env, ordenId, phone, message, tipoEvento);

    // Try to send via UltraMsg if configured
    if (config.habilitado && config.instance && config.token) {
      const result = await enviarWhatsAppUltraMsg(phone, message, config.instance, config.token);

      // Update notification status
      if (result.success) {
        await env.DB.prepare(
          `UPDATE NotificacionesWhatsApp SET estado_envio = 'enviado', respuesta = ?, intentos = 1 WHERE id = ?`
        ).bind(result.message_id, notifId).run();
        return { enviado: true, method: 'ultramsg', error: null };
      } else {
        await env.DB.prepare(
          `UPDATE NotificacionesWhatsApp SET estado_envio = 'fallido', respuesta = ?, intentos = 1 WHERE id = ?`
        ).bind(result.error, notifId).run();
        // Fall back to wa.me link
        const link = generarWaMeLink(phone, message);
        return { enviado: false, method: 'wame_link', link, error: result.error };
      }
    }

    // No WhatsApp configured - generate wa.me link
    const link = generarWaMeLink(phone, message);
    await env.DB.prepare(
      `UPDATE NotificacionesWhatsApp SET estado_envio = 'pendiente_manual', respuesta = ? WHERE id = ?`
    ).bind(link, notifId).run();

    return { enviado: false, method: 'wame_link', link, error: null };
  } catch (error) {
    console.error('Error in enviarNotificacionOrden:', error);
    return { enviado: false, method: 'none', error: error.message };
  }
}

// ============================================================
// Message Templates
// ============================================================

function buildMensajeOrdenCreada(orden) {
  return `🔧 *Nueva Orden de Trabajo*\n\n` +
    `📋 *OT #${orden.numero_orden}*\n` +
    `🚗 Patente: ${orden.patente || 'N/A'}\n` +
    `👤 Cliente: ${orden.cliente_nombre || 'N/A'}\n` +
    `📌 Estado: Enviada (pendiente aprobación)\n` +
    `💰 Estimado: $${formatCLP(orden.monto_base || 0)}\n\n` +
    `Su orden ha sido registrada y será revisada a la brevedad.\n` +
    `Gracias por preferirnos.`;
}

function buildMensajeOrdenExpress(orden) {
  return `⚡ *Orden EXPRESS Aprobada*\n\n` +
    `📋 *OT #${orden.numero_orden}*\n` +
    `🚗 Patente: ${orden.patente || 'N/A'}\n` +
    `👤 Cliente: ${orden.cliente_nombre || 'N/A'}\n` +
    `✅ Estado: APROBADA - EXPRESS\n` +
    `💰 Total: $${formatCLP(orden.monto_final || orden.monto_base || 0)}\n\n` +
    `Su orden express ha sido aprobada y será atendida de inmediato.`;
}

function buildMensajeOrdenAsignada(orden) {
  return `📋 *Nueva Orden Asignada*\n\n` +
    `🔧 *OT #${orden.numero_orden}*\n` +
    `🚗 Patente: ${orden.patente || 'N/A'}\n` +
    `👤 Cliente: ${orden.cliente_nombre || 'N/A'}\n` +
    `📞 Teléfono: ${orden.cliente_telefono || 'N/A'}\n` +
    `${orden.direccion ? `📍 Dirección: ${orden.direccion}\n` : ''}` +
    `${orden.notas ? `📝 Notas: ${orden.notas}\n` : ''}` +
    `💰 Estimado: $${formatCLP(orden.monto_base || 0)}\n\n` +
    `Por favor contactar al cliente para coordinar visita.`;
}

function buildMensajeTecnicoEnSitio(orden) {
  return `🔧 *Actualización de su Orden #${orden.numero_orden}*\n\n` +
    `🚗 Patente: ${orden.patente || 'N/A'}\n` +
    `📍 El técnico ${orden.tecnico_nombre || ''} ha llegado al sitio.\n` +
    `Se está iniciando la revisión de su vehículo.\n\n` +
    `Lo mantendremos informado del progreso.`;
}

function buildMensajeEnProgreso(orden) {
  return `🔧 *Actualización de su Orden #${orden.numero_orden}*\n\n` +
    `🚗 Patente: ${orden.patente || 'N/A'}\n` +
    `🔨 Su vehículo está en proceso de reparación.\n` +
    `Técnico: ${orden.tecnico_nombre || 'N/A'}\n\n` +
    `Le notificaremos cuando esté listo.`;
}

function buildMensajeCompletada(orden) {
  return `✅ *Orden #${orden.numero_orden} Completada*\n\n` +
    `🚗 Patente: ${orden.patente || 'N/A'}\n` +
    `💰 Total: $${formatCLP(orden.monto_final || orden.monto_base || 0)}\n\n` +
    `Su vehículo está listo para ser retirado.\n` +
    `Gracias por preferirnos.`;
}

function buildMensajeCerrada(orden) {
  return `📊 *Orden #${orden.numero_orden} - Cerrada*\n\n` +
    `🚗 Patente: ${orden.patente || 'N/A'}\n` +
    `💰 Total final: $${formatCLP(orden.monto_final || orden.monto_base || 0)}\n\n` +
    `¡Esperamos que todo esté en orden!\n` +
    `Gracias por su confianza.`;
}

/**
 * Format number as CLP currency
 */
function formatCLP(amount) {
  return Math.round(amount).toLocaleString('es-CL');
}
