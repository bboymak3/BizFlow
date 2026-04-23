// ============================================
// BIZFLOW - Create Order (Public)
// POST /api/crear-orden
// Crear nueva orden de trabajo (versión simplificada, acceso público)
// ============================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  validateRequired,
  successResponse,
  errorResponse,
  chileNowStr,
  chileToday,
  generateToken,
} from '../lib/db-helpers.js';

export async function onRequestOptions(context) {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await parseBody(request);

  if (!body) {
    return errorResponse('Body de la petición inválido');
  }

  // Required fields for creating an order
  const requiredFields = ['patente_placa', 'telefono_cliente'];
  const { valid, missing } = validateRequired(body, requiredFields);

  if (!valid) {
    return errorResponse(`Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  const {
    nombre_cliente,
    telefono_cliente,
    email_cliente,
    direccion_cliente,
    patente_placa,
    marca,
    modelo,
    anio,
    kilometraje,
    trabajo_frenos,
    detalle_frenos,
    trabajo_luces,
    detalle_luces,
    trabajo_tren_delantero,
    detalle_tren_delantero,
    trabajo_correas,
    detalle_correas,
    trabajo_componentes,
    detalle_componentes,
    nivel_combustible,
    direccion,
    referencia_direccion,
    servicios,
    observaciones,
    negocio_id = 'default',
  } = body;

  try {
    // 1. Get next order number
    const config = await env.DB.prepare(
      'SELECT ultimo_numero_orden FROM Configuracion WHERE id = 1'
    ).first();

    const nextNumber = (config?.ultimo_numero_orden || 0) + 1;

    // 2. Generate unique token for this order
    const token = generateToken(32);

    const now = chileNowStr();
    const today = chileToday();

    // 3. Find or create client
    const telefonoClean = telefono_cliente.replace(/[\s\-\(\)]/g, '').trim();
    let cliente = await env.DB.prepare(
      'SELECT id FROM Clientes WHERE telefono = ? AND negocio_id = ?'
    ).bind(telefonoClean, negocio_id).first();

    if (!cliente) {
      // Create new client
      const insertResult = await env.DB.prepare(`
        INSERT INTO Clientes (nombre, telefono, email, direccion, negocio_id)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        nombre_cliente || 'Cliente',
        telefonoClean,
        email_cliente || null,
        direccion_cliente || null,
        negocio_id
      ).run();
      cliente = { id: insertResult.meta.last_row_id };
    } else {
      // Update existing client info if new data provided
      if (nombre_cliente || email_cliente || direccion_cliente) {
        await env.DB.prepare(`
          UPDATE Clientes SET
            nombre = COALESCE(NULLIF(?, ''), nombre),
            email = COALESCE(NULLIF(?, ''), email),
            direccion = COALESCE(NULLIF(?, ''), direccion)
          WHERE id = ?
        `).bind(
          nombre_cliente || null,
          email_cliente || null,
          direccion_cliente || null,
          cliente.id
        ).run();
      }
    }

    // 4. Find or create vehicle
    let vehiculoId = null;
    const patenteClean = patente_placa.replace(/[\s\.\-]/g, '').toUpperCase().trim();

    const vehiculo = await env.DB.prepare(
      'SELECT id FROM Vehiculos WHERE patente_placa = ? AND negocio_id = ?'
    ).bind(patenteClean, negocio_id).first();

    if (vehiculo) {
      vehiculoId = vehiculo.id;
      // Update vehicle info if provided
      if (marca || modelo || anio) {
        await env.DB.prepare(`
          UPDATE Vehiculos SET
            marca = COALESCE(NULLIF(?, ''), marca),
            modelo = COALESCE(NULLIF(?, ''), modelo),
            anio = COALESCE(NULLIF(?, 0), anio),
            kilometraje = COALESCE(NULLIF(?, 0), kilometraje)
          WHERE id = ?
        `).bind(
          marca || null,
          modelo || null,
          anio ? parseInt(anio) : null,
          kilometraje ? parseInt(kilometraje) : null,
          vehiculoId
        ).run();
      }
    } else if (marca || modelo) {
      // Create new vehicle
      const insertVehiculo = await env.DB.prepare(`
        INSERT INTO Vehiculos (cliente_id, patente_placa, marca, modelo, anio, kilometraje, negocio_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        cliente.id,
        patenteClean,
        marca || null,
        modelo || null,
        anio ? parseInt(anio) : null,
        kilometraje ? parseInt(kilometraje) : null,
        negocio_id
      ).run();
      vehiculoId = insertVehiculo.meta.last_row_id;
    }

    // 5. Parse services if array
    const serviciosStr = Array.isArray(servicios)
      ? JSON.stringify(servicios)
      : (servicios || '');

    // 6. Insert the order
    const insertOrden = await env.DB.prepare(`
      INSERT INTO OrdenesTrabajo (
        numero_orden, token, cliente_id, vehiculo_id,
        patente_placa, fecha_ingreso, hora_ingreso,
        marca, modelo, anio, kilometraje,
        direccion, referencia_direccion,
        trabajo_frenos, detalle_frenos,
        trabajo_luces, detalle_luces,
        trabajo_tren_delantero, detalle_tren_delantero,
        trabajo_correas, detalle_correas,
        trabajo_componentes, detalle_componentes,
        nivel_combustible,
        servicios_seleccionados,
        diagnostico_observaciones,
        estado, estado_trabajo,
        negocio_id
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?,
        ?,
        ?,
        'Enviada', 'Pendiente Visita',
        ?
      )
    `).bind(
      nextNumber, token, cliente.id, vehiculoId,
      patenteClean, today, now.split(' ')[1],
      marca || null, modelo || null, anio ? parseInt(anio) : null, kilometraje || null,
      direccion || null, referencia_direccion || null,
      trabajo_frenos ? 1 : 0, detalle_frenos || null,
      trabajo_luces ? 1 : 0, detalle_luces || null,
      trabajo_tren_delantero ? 1 : 0, detalle_tren_delantero || null,
      trabajo_correas ? 1 : 0, detalle_correas || null,
      trabajo_componentes ? 1 : 0, detalle_componentes || null,
      nivel_combustible || null,
      serviciosStr,
      observaciones || null,
      negocio_id
    ).run();

    // 7. Update next order number in config
    await env.DB.prepare(
      'UPDATE Configuracion SET ultimo_numero_orden = ? WHERE id = 1'
    ).bind(nextNumber).run();

    const ordenId = insertOrden.meta.last_row_id;

    return successResponse({
      id: ordenId,
      numero_orden: nextNumber,
      token,
      patente_placa: patenteClean,
      estado: 'Enviada',
      estado_trabajo: 'Pendiente Visita',
      cliente_id: cliente.id,
      vehiculo_id: vehiculoId,
      fecha_creacion: now,
      mensaje: 'Orden de trabajo creada exitosamente',
    }, 201);
  } catch (error) {
    console.error('Error creating order:', error);
    return errorResponse(`Error al crear la orden: ${error.message}`, 500);
  }
}
