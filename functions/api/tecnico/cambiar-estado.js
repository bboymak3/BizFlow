// ============================================
// BIZFLOW - Change Order Work Status
// POST /api/tecnico/cambiar-estado
// Cambiar estado de trabajo de una orden
// ============================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  validateRequired,
  successResponse,
  errorResponse,
  chileNowStr,
  getConfig,
  haversineDistance,
  calcularCargoDomicilio,
  sendWhatsApp,
  generarMensajeWhatsApp,
  asegurarColumnas,
} from '../../lib/db-helpers.js';

// Valid state transitions
const VALID_TRANSITIONS = {
  'Pendiente Visita': ['En Sitio'],
  'En Sitio': ['En Progreso'],
  'En Progreso': ['Completada', 'Pendiente Piezas'],
  'Pendiente Piezas': ['En Progreso'],
  'Completada': ['No Completada'],
};

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await parseBody(request);

  if (!body) {
    return errorResponse('Body de la petición inválido');
  }

  const { valid, missing } = validateRequired(body, ['orden_id', 'tecnico_id', 'nuevo_estado']);
  if (!valid) {
    return errorResponse(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  const { orden_id, tecnico_id, nuevo_estado, latitud, longitud } = body;
  let observaciones = body.observaciones || null;

  try {
    // 1. Ensure any needed columns exist
    await asegurarColumnas(env.DB, 'OrdenesTrabajo', [
      { column: 'gps_latitud', type: 'REAL' },
      { column: 'gps_longitud', type: 'REAL' },
    ]);

    // 2. Get current order
    const orden = await env.DB.prepare(`
      SELECT * FROM OrdenesTrabajo WHERE id = ?
    `).bind(parseInt(orden_id)).first();

    if (!orden) {
      return errorResponse('Orden de trabajo no encontrada', 404);
    }

    // 3. Verify technician assignment
    if (orden.tecnico_asignado_id !== parseInt(tecnico_id)) {
      return errorResponse('Esta orden no está asignada a este técnico', 403);
    }

    // 4. Validate state transition
    const estadoActual = orden.estado_trabajo || 'Pendiente Visita';
    const allowedTransitions = VALID_TRANSITIONS[estadoActual];

    if (!allowedTransitions || !allowedTransitions.includes(nuevo_estado)) {
      return errorResponse(
        `Transición inválida: no se puede cambiar de "${estadoActual}" a "${nuevo_estado}". ` +
        `Transiciones permitidas: ${allowedTransitions ? allowedTransitions.join(', ') : 'ninguna'}`
      );
    }

    // 5. Handle specific state transitions
    const now = chileNowStr();
    let updateFields = {};
    let updateParams = [];
    let setClauses = [];

    setClauses.push('estado_trabajo = ?');
    updateParams.push(nuevo_estado);

    // --- TRANSITION: Pendiente Visita -> En Sitio ---
    if (estadoActual === 'Pendiente Visita' && nuevo_estado === 'En Sitio') {
      // Capture GPS coordinates
      if (latitud && longitud) {
        setClauses.push('gps_latitud = ?');
        updateParams.push(parseFloat(latitud));
        setClauses.push('gps_longitud = ?');
        updateParams.push(parseFloat(longitud));

        // Calculate domicilio (home visit) charge
        const config = await getConfig(env.DB);
        const tallerLat = config.domicilio_taller_lat || 0;
        const tallerLng = config.domicilio_taller_lng || 0;

        if (tallerLat !== 0 && tallerLng !== 0) {
          const distanceKm = haversineDistance(tallerLat, tallerLng, parseFloat(latitud), parseFloat(longitud));
          const cargoInfo = calcularCargoDomicilio(config, distanceKm);

          if (cargoInfo.cargo_domicilio === -1) {
            // Out of coverage area - still allow but flag it
            setClauses.push('distancia_km = ?');
            updateParams.push(cargoInfo.distancia_km);
            setClauses.push('cargo_domicilio = ?');
            updateParams.push(0);
            observaciones && (observaciones += '\n');
            observaciones = (observaciones || '') + `⚠️ Fuera de cobertura máxima (${cargoInfo.distancia_km} km)`;
          } else {
            setClauses.push('distancia_km = ?');
            updateParams.push(cargoInfo.distancia_km);
            setClauses.push('cargo_domicilio = ?');
            updateParams.push(cargoInfo.cargo_domicilio);
            setClauses.push('domicilio_modo_cobro = ?');
            updateParams.push(config.domicilio_modo_cobro || 'no_cobrar');
          }
        }
      }

      setClauses.push('estado = ?');
      updateParams.push('En Proceso');
    }

    // --- TRANSITION: En Sitio -> En Progreso ---
    if (estadoActual === 'En Sitio' && nuevo_estado === 'En Progreso') {
      // Nothing extra needed, just tracking
    }

    // --- TRANSITION: En Progreso -> Completada ---
    if (estadoActual === 'En Progreso' && nuevo_estado === 'Completada') {
      setClauses.push('fecha_completado = ?');
      updateParams.push(now);
    }

    // --- TRANSITION: En Progreso -> Pendiente Piezas ---
    if (estadoActual === 'En Progreso' && nuevo_estado === 'Pendiente Piezas') {
      if (!observaciones) {
        return errorResponse('El motivo es obligatorio al cambiar a "Pendiente Piezas"');
      }
    }

    // --- TRANSITION: Pendiente Piezas -> En Progreso (retomar) ---
    if (estadoActual === 'Pendiente Piezas' && nuevo_estado === 'En Progreso') {
      // Retomando el trabajo
    }

    // --- TRANSITION: Completada -> No Completada ---
    if (estadoActual === 'Completada' && nuevo_estado === 'No Completada') {
      if (!observaciones) {
        return errorResponse('El motivo es obligatorio al marcar como "No Completada"');
      }
    }

    // 6. Execute update
    updateParams.push(parseInt(orden_id));
    const sqlUpdate = `UPDATE OrdenesTrabajo SET ${setClauses.join(', ')} WHERE id = ?`;

    await env.DB.prepare(sqlUpdate).bind(...updateParams).run();

    // 7. Insert tracking record (SeguimientoOT)
    await env.DB.prepare(`
      INSERT INTO SeguimientoOT (orden_id, tecnico_id, estado_anterior, estado_nuevo, latitud, longitud, observaciones, fecha_evento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      parseInt(orden_id),
      parseInt(tecnico_id),
      estadoActual,
      nuevo_estado,
      latitud ? parseFloat(latitud) : null,
      longitud ? parseFloat(longitud) : null,
      observaciones || null,
      now
    ).run();

    // 8. Send WhatsApp notifications for key transitions
    const tecnico = await env.DB.prepare(`
      SELECT nombre FROM Tecnicos WHERE id = ?
    `).bind(parseInt(tecnico_id)).first();

    const cliente = await env.DB.prepare(`
      SELECT nombre, telefono FROM Clientes WHERE id = ?
    `).bind(orden.cliente_id).first();

    const config = await getConfig(env.DB);

    if (nuevo_estado === 'En Sitio' && cliente?.telefono) {
      const mensaje = generarMensajeWhatsApp('en_sitio', orden, tecnico, cliente);
      await sendWhatsApp(env.DB, config, {
        orden_id: parseInt(orden_id),
        telefono: cliente.telefono,
        mensaje,
        tipo_evento: 'en_sitio',
        negocio_id: orden.negocio_id,
      });
    }

    if (nuevo_estado === 'En Progreso' && cliente?.telefono) {
      const mensaje = generarMensajeWhatsApp('en_progreso', orden, tecnico, cliente);
      await sendWhatsApp(env.DB, config, {
        orden_id: parseInt(orden_id),
        telefono: cliente.telefono,
        mensaje,
        tipo_evento: 'en_progreso',
        negocio_id: orden.negocio_id,
      });
    }

    if (nuevo_estado === 'Completada' && cliente?.telefono) {
      const mensaje = generarMensajeWhatsApp('completada', orden, tecnico, cliente);
      await sendWhatsApp(env.DB, config, {
        orden_id: parseInt(orden_id),
        telefono: cliente.telefono,
        mensaje,
        tipo_evento: 'completada',
        negocio_id: orden.negocio_id,
      });
    }

    if (nuevo_estado === 'Pendiente Piezas' && cliente?.telefono) {
      const mensaje = generarMensajeWhatsApp('pendiente_piezas', orden, tecnico, cliente);
      await sendWhatsApp(env.DB, config, {
        orden_id: parseInt(orden_id),
        telefono: cliente.telefono,
        mensaje,
        tipo_evento: 'pendiente_piezas',
        negocio_id: orden.negocio_id,
      });
    }

    return successResponse({
      orden_id: parseInt(orden_id),
      estado_anterior: estadoActual,
      estado_nuevo: nuevo_estado,
      fecha_evento: now,
      mensaje: `Estado cambiado exitosamente de "${estadoActual}" a "${nuevo_estado}"`,
    });
  } catch (error) {
    console.error('Error changing order status:', error);
    return errorResponse('Error al cambiar el estado de la orden', 500);
  }
}
