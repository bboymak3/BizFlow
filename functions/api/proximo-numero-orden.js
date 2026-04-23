// ============================================
// BIZFLOW - Get Next Order Number
// GET /api/proximo-numero-orden
// Obtener el próximo número de orden disponible
// ============================================

import {
  corsHeaders,
  handleOptions,
  successResponse,
  errorResponse,
} from '../lib/db-helpers.js';

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const config = await env.DB.prepare(
      'SELECT ultimo_numero_orden FROM Configuracion WHERE id = 1'
    ).first();

    const currentNumber = config?.ultimo_numero_orden || 0;
    const nextNumber = currentNumber + 1;

    // Also check if there are any gaps in the sequence
    const maxOrderNumber = await env.DB.prepare(
      'SELECT MAX(numero_orden) AS max_num FROM OrdenesTrabajo'
    ).first();

    const dbMax = maxOrderNumber?.max_num || 0;
    const suggestedNumber = Math.max(nextNumber, dbMax + 1);

    return successResponse({
      numero_actual: currentNumber,
      proximo_numero: suggestedNumber,
      numero_formateado: String(suggestedNumber).padStart(4, '0'),
    });
  } catch (error) {
    console.error('Error getting next order number:', error);
    return errorResponse('Error al obtener el próximo número de orden', 500);
  }
}
