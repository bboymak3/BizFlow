// ============================================================
// BizFlow - Notificaciones WhatsApp (UltraMsg API)
// 7 eventos automáticos de notificación
// ============================================================

const ULTRAMSG_BASE_URL = 'https://api.ultramsg.com';

async function enviarUltraMsg(instance, token, telefono, mensaje) {
  try {
    const url = `${ULTRAMSG_BASE_URL}/${instance}/messages/chat`;
    const body = new URLSearchParams({
      token,
      to: telefono,
      body: mensaje
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await response.json();
    return { exito: data.status === 'success', data };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function getConfigWhatsApp(env) {
  const instance = env.ULTRAMSG_INSTANCE || '';
  const token = env.ULTRAMSG_TOKEN || '';
  return { instance, token, activo: !!(instance && token) };
}

// ============================================================
// PLANTILLAS DE MENSAJES
// ============================================================

const PLANTILLAS = {
  nueva_orden: (ot, cliente, empresa) =>
    `🆕 *Nueva Orden de Trabajo #${ot.numero}*\n` +
    `👤 Cliente: ${cliente?.nombre || 'N/A'} ${cliente?.apellido || ''}\n` +
    `🚗 Vehículo: ${ot.placa || 'N/A'}\n` +
    `📋 Descripción: ${ot.descripcion || ot.titulo || 'N/A'}\n` +
    `🏢 ${empresa}\n` +
    `📅 Creada: ${ot.fecha_creacion || ''}`,

  asignada_tecnico: (ot, tecnico) =>
    `🔧 *Orden Asignada #${ot.numero}*\n` +
    `📌 Estado: *ASIGNADA*\n` +
    `👷 Técnico: *${tecnico?.nombre || 'N/A'}*\n` +
    `📋 ${ot.descripcion || ot.titulo || ''}\n` +
    `📅 ${ot.fecha_asignacion || ''}`,

  cambio_estado: (ot, estadoNuevo) =>
    `📊 *Actualización OT #${ot.numero}*\n` +
    `🔄 Estado: *${estadoNuevo.toUpperCase()}*\n` +
    `📋 ${ot.descripcion || ot.titulo || ''}`,

  completada: (ot, cliente) =>
    `✅ *Orden Completada #${ot.numero}*\n` +
    `🛠️ Trabajo finalizado exitosamente\n` +
    `💰 Total: $${(ot.total || 0).toFixed(2)}\n` +
    `📧 Aprobación pendiente\n` +
    `${cliente?.nombre || ''}`,

  aprobacion_pendiente: (ot) =>
    `📝 *Aprobación Pendiente - OT #${ot.numero}*\n` +
    `Su orden de trabajo está lista para revisar.\n` +
    `🔗 *Apruebe aquí:* ${ot.url_aprobacion || 'Pendiente'}`,

  aprobada: (ot) =>
    `✅ *Orden Aprobada #${ot.numero}*\n` +
    `Gracias por su aprobación. ¡Hasta pronto!`,

  cancelada: (ot, motivo) =>
    `❌ *Orden Cancelada #${ot.numero}*\n` +
    `${motivo ? `Motivo: ${motivo}` : 'Sin motivo especificado'}`,

  encuesta: (ot) =>
    `⭐ *Califique nuestro servicio*\n` +
    `Orden #${ot.numero}\n` +
    `1-5 estrellas, su opinión cuenta.\n` +
    `${ot.url_aprobacion || ''}`
};

// ============================================================
// FUNCIONES DE NOTIFICACIÓN
// ============================================================

export async function enviarNotificacion(env, DB, tipo, ordenId, datosExtra = {}) {
  const config = getConfigWhatsApp(env);
  if (!config.activo) {
    console.log(`WhatsApp no configurado. Notificación ${tipo} no enviada.`);
    return { enviada: false, razon: 'no_configurado' };
  }

  // Obtener datos de la OT
  const ot = await DB.prepare(`
    SELECT ot.*, c.telefono as cliente_telefono, c.nombre as cliente_nombre, c.apellido as cliente_apellido,
           t.nombre as tecnico_nombre
    FROM OrdenesTrabajo ot
    LEFT JOIN Clientes c ON ot.cliente_id = c.id
    LEFT JOIN Tecnicos t ON ot.tecnico_id = t.id
    WHERE ot.id = ?
  `).bind(ordenId).first();

  if (!ot) return { enviada: false, razon: 'ot_no_encontrada' };

  // Obtener teléfono del destinatario según tipo
  let telefono = '';
  if (['nueva_orden', 'completada', 'aprobacion_pendiente', 'aprobada', 'cancelada', 'encuesta'].includes(tipo)) {
    telefono = ot.cliente_telefono || datosExtra.telefono || '';
  } else if (['asignada_tecnico', 'cambio_estado'].includes(tipo)) {
    telefono = datosExtra.telefono || '';
  }

  if (!telefono) return { enviada: false, razon: 'sin_telefono' };

  // Construir mensaje
  const plantilla = PLANTILLAS[tipo];
  if (!plantilla) return { enviada: false, razon: 'tipo_no_valido' };

  const mensaje = plantilla(ot, datosExtra, datosExtra.empresa || 'BizFlow');

  // Enviar
  const resultado = await enviarUltraMsg(config.instance, config.token, telefono, mensaje);

  // Registrar en D1
  await DB.prepare(`
    INSERT INTO NotificacionesWhatsApp (orden_id, destinatario, tipo, mensaje, estado_envio, error, enviado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    ordenId, telefono, tipo, mensaje,
    resultado.exito ? 'enviada' : 'fallida',
    resultado.error || '', resultado.exito ? new Date().toISOString() : null
  ).run();

  return resultado;
}

// Enviar notificación automática según evento
export async function notificarCambioEstado(env, DB, ordenId, estadoNuevo, datosExtra = {}) {
  const mapaEventos = {
    'asignada': 'asignada_tecnico',
    'en_proceso': 'cambio_estado',
    'pausada': 'cambio_estado',
    'completada': 'completada',
    'cancelada': 'cancelada',
    'aprobada': 'aprobada',
    'cerrada': 'encuesta'
  };

  const tipoNotificacion = mapaEventos[estadoNuevo];
  if (tipoNotificacion) {
    return await enviarNotificacion(env, DB, tipoNotificacion, ordenId, {
      ...datosExtra,
      estadoNuevo
    });
  }
  return { enviada: false, razon: 'sin_evento' };
}

// Enviar notificación de nueva OT
export async function notificarNuevaOT(env, DB, ordenId) {
  return await enviarNotificacion(env, DB, 'nueva_orden', ordenId);
}

// Alias: enviarNotificacionOrden
export const enviarNotificacionOrden = enviarNotificacion;

// Alias: enviarWhatsAppUltraMsg
export async function enviarWhatsAppUltraMsg(env, telefono, mensaje) {
  const config = getConfigWhatsApp(env);
  if (!config.activo) return { exito: false, razon: 'no_configurado' };
  return await enviarUltraMsg(config.instance, config.token, telefono, mensaje);
}

// Alias: normalizarTelefonoChile
export function normalizarTelefonoChile(phone) {
  if (!phone) return '';
  return phone.replace(/[^0-9+]/g, '').replace(/^56/, '+56');
}
