// ============================================================
// BizFlow - Crear Orden (Create Work Order) API
// POST: Create normal (Enviada) or express (Aprobada) work order
// ============================================================

import {
  corsHeaders,
  handleOptions,
  parseBody,
  successRes,
  errorRes,
  chileNowISO,
  chileDate,
  generateUUID,
  asegurarColumnasFaltantes,
} from '../../lib/db-helpers.js';
import { enviarNotificacionOrden } from '../../lib/notificaciones.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const data = await parseBody(request);

  const {
    patente, cliente_nombre, cliente_telefono, cliente_email,
    marca, modelo, anio, color, direccion,
    monto_base, mano_obra, descuento,
    metodo_pago, abono,
    urgencia, notas, servicios,
    express,
    negocio_id,
  } = data;

  // Validate required fields
  if (!patente || !patente.trim()) {
    return errorRes('Patente es requerida');
  }
  if (!cliente_nombre || !cliente_nombre.trim()) {
    return errorRes('Nombre del cliente es requerido');
  }
  if (!cliente_telefono || !cliente_telefono.trim()) {
    return errorRes('Teléfono del cliente es requerido');
  }

  try {
    await asegurarColumnasFaltantes(env);

    const negId = negocio_id || 1;
    const now = chileNowISO();
    const today = chileDate();
    const token = generateUUID();

    // Normalize patente (uppercase, no spaces)
    const patenteNorm = patente.trim().toUpperCase().replace(/\s/g, '');

    // Get next order number
    let numeroOrden = 1;
    try {
      const lastOrder = await env.DB.prepare(
        `SELECT MAX(CAST(numero_orden AS INTEGER)) as max_num FROM OrdenesTrabajo WHERE (negocio_id = ? OR negocio_id IS NULL)`
      ).bind(negId).first();
      if (lastOrder && lastOrder.max_num) {
        numeroOrden = parseInt(lastOrder.max_num) + 1;
      }
    } catch {
      // If numero_orden doesn't exist, try id-based numbering
      const lastOrder = await env.DB.prepare(
        `SELECT MAX(id) as max_id FROM OrdenesTrabajo`
      ).first();
      if (lastOrder && lastOrder.max_id) {
        numeroOrden = lastOrder.max_id + 1;
      }
    }

    // Calculate final amount
    const base = parseFloat(monto_base) || 0;
    const manoObra = parseFloat(mano_obra) || 0;
    const desc = parseFloat(descuento) || 0;
    const montoFinal = Math.max(0, base + manoObra - desc);
    const abonoMonto = parseFloat(abono) || 0;
    const restante = Math.max(0, montoFinal - abonoMonto);

    // Express orders are auto-approved
    const estado = express ? 'Aprobada' : 'Enviada';
    const estadoTrabajo = express ? 'Pendiente Visita' : null;
    const isExpress = express ? 1 : 0;

    // Create or update Clientes record
    try {
      const existingClient = await env.DB.prepare(
        `SELECT id FROM Clientes WHERE telefono = ? AND (negocio_id = ? OR negocio_id IS NULL) LIMIT 1`
      ).bind(cliente_telefono.trim(), negId).first();

      if (existingClient) {
        await env.DB.prepare(
          `UPDATE Clientes SET nombre = ?, email = ?, updated_at = ? WHERE id = ?`
        ).bind(cliente_nombre.trim(), cliente_email?.trim() || null, now, existingClient.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO Clientes (nombre, telefono, email, negocio_id, created_at) VALUES (?, ?, ?, ?, ?)`
        ).bind(cliente_nombre.trim(), cliente_telefono.trim(), cliente_email?.trim() || null, negId, now).run();
      }
    } catch (clientError) {
      console.error('Client upsert warning:', clientError);
      // Non-critical, continue
    }

    // Create or update Vehiculos record
    try {
      const existingVeh = await env.DB.prepare(
        `SELECT id FROM Vehiculos WHERE patente = ? AND (negocio_id = ? OR negocio_id IS NULL) LIMIT 1`
      ).bind(patenteNorm, negId).first();

      if (existingVeh) {
        await env.DB.prepare(
          `UPDATE Vehiculos SET marca = ?, modelo = ?, anio = ?, color = ?, updated_at = ? WHERE id = ?`
        ).bind(
          marca?.trim() || null, modelo?.trim() || null,
          anio ? parseInt(anio) : null, color?.trim() || null,
          now, existingVeh.id
        ).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO Vehiculos (patente, marca, modelo, anio, color, negocio_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          patenteNorm, marca?.trim() || null, modelo?.trim() || null,
          anio ? parseInt(anio) : null, color?.trim() || null,
          negId, now
        ).run();
      }
    } catch (vehError) {
      console.error('Vehicle upsert warning:', vehError);
    }

    // Check columns available in OrdenesTrabajo
    const columns = await getColumnas(env);

    // Build insert statement dynamically based on available columns
    const insertFields = [];
    const insertValues = [];

    if (columns.includes('numero_orden')) { insertFields.push('numero_orden'); insertValues.push(String(numeroOrden)); }
    if (columns.includes('token')) { insertFields.push('token'); insertValues.push(token); }
    insertFields.push('patente'); insertValues.push(patenteNorm);
    insertFields.push('cliente_nombre'); insertValues.push(cliente_nombre.trim());
    insertFields.push('cliente_telefono'); insertValues.push(cliente_telefono.trim());
    if (columns.includes('cliente_email')) { insertFields.push('cliente_email'); insertValues.push(cliente_email?.trim() || null); }
    if (columns.includes('marca')) { insertFields.push('marca'); insertValues.push(marca?.trim() || null); }
    if (columns.includes('modelo')) { insertFields.push('modelo'); insertValues.push(modelo?.trim() || null); }
    insertFields.push('estado'); insertValues.push(estado);
    if (columns.includes('estado_trabajo')) { insertFields.push('estado_trabajo'); insertValues.push(estadoTrabajo); }
    if (columns.includes('monto_base')) { insertFields.push('monto_base'); insertValues.push(base); }
    if (columns.includes('mano_obra')) { insertFields.push('mano_obra'); insertValues.push(manoObra); }
    if (columns.includes('descuento')) { insertFields.push('descuento'); insertValues.push(desc); }
    if (columns.includes('monto_final')) { insertFields.push('monto_final'); insertValues.push(montoFinal); }
    if (columns.includes('metodo_pago')) { insertFields.push('metodo_pago'); insertValues.push(metodo_pago || 'efectivo'); }
    if (columns.includes('abono')) { insertFields.push('abono'); insertValues.push(abonoMonto); }
    if (columns.includes('restante')) { insertFields.push('restante'); insertValues.push(restante); }
    if (columns.includes('urgencia')) { insertFields.push('urgencia'); insertValues.push(urgencia || 'normal'); }
    if (columns.includes('express')) { insertFields.push('express'); insertValues.push(isExpress); }
    if (columns.includes('notas')) { insertFields.push('notas'); insertValues.push(notas || null); }
    if (columns.includes('direccion')) { insertFields.push('direccion'); insertValues.push(direccion?.trim() || null); }
    if (columns.includes('fecha_creacion')) { insertFields.push('fecha_creacion'); insertValues.push(today); }
    if (columns.includes('fecha')) { insertFields.push('fecha'); insertValues.push(today); }
    if (columns.includes('created_at')) { insertFields.push('created_at'); insertValues.push(now); }
    insertFields.push('negocio_id'); insertValues.push(negId);

    const placeholders = insertFields.map(() => '?').join(', ');
    const result = await env.DB.prepare(
      `INSERT INTO OrdenesTrabajo (${insertFields.join(', ')}) VALUES (${placeholders})`
    ).bind(...insertValues).run();

    const ordenId = result.meta.last_row_id;

    // Add services if provided
    if (servicios && Array.isArray(servicios) && servicios.length > 0) {
      try {
        const columnsOT = await getColumnas(env, 'OrdenesTrabajo');
        // Check if ServiciosOrden table exists
        const servColumns = await getColumnas(env, 'ServiciosOrden');

        if (servColumns.length > 0) {
          for (const serv of servicios) {
            await env.DB.prepare(
              `INSERT INTO ServiciosOrden (orden_id, nombre_servicio, precio, negocio_id) VALUES (?, ?, ?, ?)`
            ).bind(
              ordenId,
              serv.nombre || serv.servicio || 'Servicio',
              parseFloat(serv.precio) || 0,
              negId
            ).run();
          }
        }
      } catch (servError) {
        console.error('Services insert warning:', servError);
      }
    }

    // Send WhatsApp notification (async, don't block)
    const tipoEvento = express ? 'orden_express' : 'orden_creada';
    enviarNotificacionOrden(env, ordenId, tipoEvento).catch(err => {
      console.error('Notification send error:', err);
    });

    // Return the created order
    const orden = await env.DB.prepare(
      `SELECT * FROM OrdenesTrabajo WHERE id = ?`
    ).bind(ordenId).first();

    return successRes({
      ...orden,
      token,
      numero_orden: String(numeroOrden),
    }, 201);
  } catch (error) {
    console.error('Crear orden error:', error);
    return errorRes('Error creando orden: ' + error.message, 500);
  }
}

async function getColumnas(env) {
  try {
    const result = await env.DB.prepare(`PRAGMA table_info("OrdenesTrabajo")`).all();
    return result?.results?.map(r => r.name) || [];
  } catch {
    return [];
  }
}
