// ============================================================
// BizFlow - Configuración SaaS API
// GET: get all config from Configuracion table
// POST: update config fields (negocio_nombre, negocio_direccion, etc.)
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

export async function onRequestOptions() {
  return handleOptions();
}

// GET - Get all config
export async function onRequestGet(context) {
  const { env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const config = await getConfig(env.DB);

    // Mask sensitive fields
    const safeConfig = { ...config };
    if (safeConfig.whatsapp_ultramsg_token) {
      safeConfig.whatsapp_ultramsg_token_masked =
        safeConfig.whatsapp_ultramsg_token.substring(0, 4) + '****' +
        safeConfig.whatsapp_ultramsg_token.substring(safeConfig.whatsapp_ultramsg_token.length - 4);
      delete safeConfig.whatsapp_ultramsg_token;
    }
    if (safeConfig.ultramsg_token) {
      safeConfig.ultramsg_token_masked =
        safeConfig.ultramsg_token.substring(0, 4) + '****' +
        safeConfig.ultramsg_token.substring(safeConfig.ultramsg_token.length - 4);
      delete safeConfig.ultramsg_token;
    }

    return successRes(safeConfig);
  } catch (error) {
    console.error('Config get error:', error);
    return errorRes('Error obteniendo configuración: ' + error.message, 500);
  }
}

// POST - Update config fields
export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);

  if (!data || Object.keys(data).length === 0) {
    return errorRes('No se proporcionaron campos para actualizar');
  }

  try {
    await asegurarColumnasFaltantes(env);

    // Get available columns
    const confCols = await getColumnas(env, 'Configuracion');

    // Allowed config fields (security: whitelist approach)
    const allowedFields = [
      'negocio_nombre',
      'negocio_direccion',
      'negocio_telefono',
      'negocio_email',
      'negocio_logo',
      'ultimo_numero_orden',
      'domicilio_habilitado',
      'domicilio_taller_lat',
      'domicilio_taller_lng',
      'domicilio_radio_gratis_km',
      'domicilio_tarifa_por_km',
      'domicilio_cargo_minimo',
      'domicilio_cobertura_maxima_km',
      'domicilio_modo_cobro',
      'whatsapp_ultramsg_instance',
      'whatsapp_ultramsg_token',
      'ultramsg_instance',
      'ultramsg_token',
    ];

    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(data)) {
      if (!allowedFields.includes(key)) continue;
      if (!confCols.includes(key)) continue;

      updates.push(`${key} = ?`);
      params.push(value);
    }

    if (updates.length === 0) {
      return errorRes('No hay campos válidos para actualizar');
    }

    if (confCols.includes('updated_at')) {
      updates.push('updated_at = ?');
      params.push(chileNowISO());
    }

    params.push(1); // WHERE id = 1

    await env.DB.prepare(
      `UPDATE Configuracion SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    // Return updated config (masked)
    const updatedConfig = await getConfig(env.DB);
    const safeConfig = { ...updatedConfig };
    if (safeConfig.whatsapp_ultramsg_token) {
      safeConfig.whatsapp_ultramsg_token_masked =
        safeConfig.whatsapp_ultramsg_token.substring(0, 4) + '****' +
        safeConfig.whatsapp_ultramsg_token.substring(safeConfig.whatsapp_ultramsg_token.length - 4);
      delete safeConfig.whatsapp_ultramsg_token;
    }
    if (safeConfig.ultramsg_token) {
      safeConfig.ultramsg_token_masked =
        safeConfig.ultramsg_token.substring(0, 4) + '****' +
        safeConfig.ultramsg_token.substring(safeConfig.ultramsg_token.length - 4);
      delete safeConfig.ultramsg_token;
    }

    return successRes({ actualizado: true, config: safeConfig });
  } catch (error) {
    console.error('Config update error:', error);
    return errorRes('Error actualizando configuración: ' + error.message, 500);
  }
}
