// ============================================================
// BizFlow - DB Helpers
// Funciones compartidas para interactuar con D1
// ============================================================

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function successResponse(data, status = 200) {
  return jsonResponse({ success: true, ...data }, status);
}

// Alias for compatibility
export const successRes = successResponse;
export const errorRes = errorResponse;

export async function getUserIdFromRequest(request, DB) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const email = auth.replace('Bearer ', '');
    const user = await DB.prepare('SELECT id FROM Usuarios WHERE email = ? AND activo = 1').bind(email).first();
    if (user) return user.id;
  }
  const url = new URL(request.url);
  const userId = url.searchParams.get('usuario_id');
  if (userId) return parseInt(userId);
  return null;
}

export async function getProximoNumero(DB, usuarioId) {
  const result = await DB.prepare(
    'SELECT COALESCE(MAX(numero), 0) + 1 as proximo FROM OrdenesTrabajo WHERE usuario_id = ?'
  ).bind(usuarioId).first();
  return result?.proximo || 1;
}

export function validarEstadoOT(nuevoEstado) {
  const estadosValidos = [
    'pendiente', 'asignada', 'en_proceso', 'pausada',
    'completada', 'cancelada', 'aprobada', 'cerrada'
  ];
  return estadosValidos.includes(nuevoEstado);
}

export function generarToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const generateToken = generarToken;

export function generateUUID() {
  return crypto.randomUUID();
}

export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function formatearFecha(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-VE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export function hoyISO() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export const chileNowStr = hoyISO;

export function chileNowISO() {
  return new Date().toISOString();
}

export function chileDate() {
  return new Date().toISOString().split('T')[0];
}

export function chileToday() {
  return new Date().toISOString().split('T')[0];
}

// Handle CORS preflight
export function handleCors(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  return null;
}

export const handleOptions = handleCors;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Paginación helper
export function paginar(query, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  return {
    sql: `${query} LIMIT ? OFFSET ?`,
    params: [limit, offset],
    page,
    limit,
    offset
  };
}

// Parse request body
export async function parseBody(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

// Validate required fields
export function validateRequired(body, fields) {
  const missing = [];
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missing.push(field);
    }
  }
  return {
    valid: missing.length === 0,
    missing,
  };
}

// Get configuration from DB
export async function getConfig(DB) {
  const rows = await DB.prepare('SELECT clave, valor FROM Configuracion').all();
  const config = {};
  for (const row of (rows.results || [])) {
    config[row.clave] = row.valor;
  }
  return config;
}

// Ensure columns exist in a table (for schema migrations)
export async function asegurarColumnas(DB, tableName, columns) {
  for (const col of columns) {
    try {
      // Check if column exists
      const tableInfo = await DB.prepare(`PRAGMA table_info(${tableName})`).all();
      const exists = (tableInfo.results || []).some(r => r.name === col.column);
      if (!exists) {
        const defaultVal = col.default !== undefined ? ` DEFAULT '${col.default}'` : '';
        await DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${col.column} ${col.type}${defaultVal}`).run();
      }
    } catch (e) {
      console.warn(`Could not ensure column ${tableName}.${col.column}:`, e.message);
    }
  }
}

export async function asegurarColumnasFaltantes(env) {
  try {
    // Tables that may not exist (from Globalprov2)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ConfigKV (
      clave TEXT PRIMARY KEY, valor TEXT, actualizado_en TEXT DEFAULT (datetime('now'))
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AdminUsers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, nombre TEXT NOT NULL, activo INTEGER DEFAULT 1, creado_en TEXT
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS SesionesAdmin (
      id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL, expires_at TEXT, creado_en TEXT
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS SeguimientoTrabajo (
      id INTEGER PRIMARY KEY AUTOINCREMENT, orden_id INTEGER NOT NULL,
      tecnico_id INTEGER, estado_anterior TEXT DEFAULT '', estado_nuevo TEXT NOT NULL,
      latitud REAL, longitud REAL, observaciones TEXT,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // AgendaTecnicos - Calendario de agendamiento por técnico
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AgendaTecnicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tecnico_id INTEGER NOT NULL,
      orden_id INTEGER,
      titulo TEXT NOT NULL,
      tipo_servicio TEXT NOT NULL DEFAULT 'taller',
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT NOT NULL,
      color TEXT DEFAULT '#0d6efd',
      observaciones TEXT,
      estado TEXT DEFAULT 'pendiente',
      creado_por TEXT DEFAULT 'admin',
      fecha_creacion TEXT DEFAULT (datetime('now', '-3 hours'))
    )`).run();

    // Columns that may be missing in OrdenesTrabajo
    const colsOT = [
      'numero_orden INTEGER', 'token TEXT', 'patente_placa TEXT',
      'fecha_ingreso TEXT', 'hora_ingreso TEXT', 'recepcionista TEXT',
      'marca TEXT', 'modelo TEXT', 'anio INTEGER', 'cilindrada TEXT', 'combustible TEXT',
      'kilometraje TEXT', 'direccion TEXT',
      'trabajo_frenos INTEGER DEFAULT 0', 'detalle_frenos TEXT',
      'trabajo_luces INTEGER DEFAULT 0', 'detalle_luces TEXT',
      'trabajo_tren_delantero INTEGER DEFAULT 0', 'detalle_tren_delantero TEXT',
      'trabajo_correas INTEGER DEFAULT 0', 'detalle_correas TEXT',
      'trabajo_componentes INTEGER DEFAULT 0', 'detalle_componentes TEXT',
      'nivel_combustible TEXT',
      'check_paragolfe_delantero_der INTEGER DEFAULT 0',
      'check_puerta_delantera_der INTEGER DEFAULT 0',
      'check_puerta_trasera_der INTEGER DEFAULT 0',
      'check_paragolfe_trasero_izq INTEGER DEFAULT 0',
      'check_otros_carroceria TEXT',
      'monto_total REAL DEFAULT 0', 'monto_abono REAL DEFAULT 0',
      'monto_restante REAL DEFAULT 0',
      'firma_imagen TEXT', 'fecha_aprobacion TEXT', 'completo INTEGER DEFAULT 0',
      'es_express INTEGER DEFAULT 0', 'estado_trabajo TEXT',
      'tecnico_asignado_id INTEGER', 'cliente_nombre TEXT', 'cliente_telefono TEXT',
      'motivo_cancelacion TEXT', 'fecha_cancelacion TEXT',
      'pagado INTEGER DEFAULT 0', 'notas TEXT',
      'referencia_direccion TEXT', 'distancia_km REAL DEFAULT 0',
      'cargo_domicilio REAL DEFAULT 0',
      "domicilio_modo_cobro TEXT DEFAULT 'no_cobrar'",
      'diagnostico_checks TEXT', 'diagnostico_observaciones TEXT',
      'servicios_seleccionados TEXT', 'fecha_completado TEXT',
      'aprobado_por TEXT', 'token_firma_tecnico TEXT',
      'negocio_id INTEGER', 'cliente_email TEXT',
      'monto_base REAL DEFAULT 0', 'mano_obra REAL DEFAULT 0',
      'descuento REAL DEFAULT 0', 'monto_final REAL DEFAULT 0',
      'urgencia TEXT', 'color TEXT',
      'cerrada_por TEXT', 'fecha_cierre TEXT',
      'patente TEXT'
    ];
    for (const colDef of colsOT) {
      try { await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN ${colDef}`).run(); } catch (e) {}
    }

    // Columns in Tecnicos
    try { await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN comision_porcentaje REAL NOT NULL DEFAULT 40`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN password TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN token TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN pin TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN codigo_acceso TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP`).run(); } catch (e) {}

    // Columns in CostosAdicionales
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN monto REAL DEFAULT 0`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Mano de Obra'`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN registrado_por TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN cantidad REAL DEFAULT 1`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN precio_unitario REAL DEFAULT 0`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN total REAL DEFAULT 0`).run(); } catch (e) {}

    // Columns in ServiciosCatalogo
    try { await env.DB.prepare(`ALTER TABLE ServiciosCatalogo ADD COLUMN precio_sugerido REAL NOT NULL DEFAULT 0`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE ServiciosCatalogo ADD COLUMN tipo_comision TEXT NOT NULL DEFAULT 'mano_obra'`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE ServiciosCatalogo ADD COLUMN fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP`).run(); } catch (e) {}

    // Columns in GastosNegocio
    try { await env.DB.prepare(`ALTER TABLE GastosNegocio ADD COLUMN fecha_gasto DATE`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE GastosNegocio ADD COLUMN observaciones TEXT`).run(); } catch (e) {}

    // Columns in NotificacionesWhatsApp
    try { await env.DB.prepare(`ALTER TABLE NotificacionesWhatsApp ADD COLUMN telefono TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE NotificacionesWhatsApp ADD COLUMN tipo_evento TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE NotificacionesWhatsApp ADD COLUMN enviada INTEGER DEFAULT 0`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE NotificacionesWhatsApp ADD COLUMN fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP`).run(); } catch (e) {}

    // Columns in Clientes
    try { await env.DB.prepare(`ALTER TABLE Clientes ADD COLUMN rut TEXT`).run(); } catch (e) {}

    // Columns in FotosTrabajo (code uses url_imagen, fecha_subida, tecnico_id)
    try { await env.DB.prepare(`ALTER TABLE FotosTrabajo ADD COLUMN url_imagen TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE FotosTrabajo ADD COLUMN fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE FotosTrabajo ADD COLUMN tecnico_id INTEGER`).run(); } catch (e) {}

    // Columns in NotasTrabajo (code uses nota, fecha_nota, tecnico_id)
    try { await env.DB.prepare(`ALTER TABLE NotasTrabajo ADD COLUMN nota TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE NotasTrabajo ADD COLUMN fecha_nota DATETIME DEFAULT CURRENT_TIMESTAMP`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE NotasTrabajo ADD COLUMN tecnico_id INTEGER`).run(); } catch (e) {}

    // Columns in Vehiculos
    try { await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN patente_placa TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN cilindrada TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN combustible TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN kilometraje TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN color TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN vin TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN negocio_id INTEGER`).run(); } catch (e) {}

    // ConfigKV default rows
    try { await env.DB.prepare(`INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('negocio_nombre', 'BizFlow')`).run(); } catch (e) {}
    try { await env.DB.prepare(`INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES ('ultimo_numero_orden', '0')`).run(); } catch (e) {}

    // Extra columns in OrdenesTrabajo
    try { await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN fecha_programada TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN hora_programada TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_email TEXT`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_rut TEXT`).run(); } catch (e) {}

    // Ensure ultimo_numero_orden in Configuracion
    try { await env.DB.prepare(`ALTER TABLE Configuracion ADD COLUMN ultimo_numero_orden INTEGER DEFAULT 0`).run(); } catch (e) {}
  } catch (e) {
    console.log('asegurarColumnasFaltantes:', e.message);
  }
}

export async function getColumnas(env, tableName) {
  try {
    const info = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
    return (info.results || []).map(r => r.name);
  } catch {
    return [];
  }
}

export function getFechaColumn(tabla) {
  const fechaColumns = {
    'OrdenesTrabajo': 'fecha_creacion',
    'FotosTrabajo': 'creado_en',
    'NotasTrabajo': 'creado_en',
    'SeguimientoOT': 'creado_en',
    'Pagos': 'fecha_pago',
    'GastosNegocio': 'fecha',
    'Clientes': 'creado_en',
    'Tecnicos': 'creado_en',
    'Inventario': 'creado_en',
    'LandingPages': 'creado_en',
    'NotificacionesWhatsApp': 'creado_en',
  };
  return fechaColumns[tabla] || 'creado_en';
}

// Globalprov2-compatible version: getFechaColumn(env) - returns column info object
export async function getFechaColumnEnv(env) {
  const cols = await getColumnas(env, 'OrdenesTrabajo');
  const tiene = cols.includes('fecha_creacion');
  return {
    col: tiene ? "COALESCE(o.fecha_creacion, o.fecha_ingreso)" : "o.fecha_ingreso",
    as: tiene ? "COALESCE(o.fecha_creacion, o.fecha_ingreso)" : "o.fecha_ingreso",
    select: tiene ? "COALESCE(o.fecha_creacion, o.fecha_ingreso) as fecha_creacion" : "o.fecha_ingreso as fecha_creacion",
    tiene_fecha_creacion: tiene,
    tiene_fecha_completado: cols.includes('fecha_completado'),
    tiene_servicios: cols.includes('servicios_seleccionados'),
    tiene_diag_checks: cols.includes('diagnostico_checks'),
    tiene_diag_obs: cols.includes('diagnostico_observaciones'),
    tiene_referencia_dir: cols.includes('referencia_direccion'),
    tiene_distancia_km: cols.includes('distancia_km'),
    tiene_cargo_domicilio: cols.includes('cargo_domicilio'),
    tiene_domicilio_modo_cobro: cols.includes('domicilio_modo_cobro')
  };
}

export function buildFechaWhere(tabla, alias = '', desde, hasta) {
  const col = getFechaColumn(tabla);
  const prefix = alias ? `${alias}.` : '';
  let where = '1=1';
  if (desde) where += ` AND ${prefix}${col} >= ?`;
  if (hasta) where += ` AND ${prefix}${col} <= ?`;
  return where;
}

// Globalprov2-compatible version: buildFechaWhere(fechaCol, periodo, valor)
export function buildFechaWhereGP(fechaCol, periodo, valor) {
  if (!valor) return { condicion: '', params: [] };
  switch (periodo) {
    case 'dia':
      return { condicion: `date(${fechaCol}) = ?`, params: [valor] };
    case 'semana': {
      const [y, w] = valor.split('-').map(Number);
      return { condicion: `strftime('%Y', ${fechaCol}) = ? AND cast(strftime('%W', ${fechaCol}) as integer) = ?`, params: [String(y), w] };
    }
    case 'anio':
      return { condicion: `strftime('%Y', ${fechaCol}) = ?`, params: [valor] };
    case 'quincena':
      return { condicion: `strftime('%Y-%m', ${fechaCol}) = ? AND cast(strftime('%d', ${fechaCol}) as integer) <= 15`, params: [valor] };
    case 'mes':
    default:
      return { condicion: `strftime('%Y-%m', ${fechaCol}) = ?`, params: [valor] };
  }
}

// Get technician info (column detection)
export async function getTecnicosInfo(env) {
  const cols = await getColumnas(env, 'Tecnicos');
  return {
    tiene_comision: cols.includes('comision_porcentaje'),
    select: cols.includes('comision_porcentaje') ? 't.comision_porcentaje' : '40 as comision_porcentaje'
  };
}

// chileNow SQL expression for D1
export function chileNow() {
  return "datetime('now', '-3 hours')";
}

// chileDate SQL expression for D1
export function chileDateSQL() {
  return "date('now', '-3 hours')";
}

// HTML Response helper
export function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// HTML escape
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Get order by approval token
export async function getOrderByToken(DB, token) {
  const order = await DB.prepare(`
    SELECT * FROM OrdenesTrabajo
    WHERE token_aprobacion = ? OR token_aprobacion_tecnico = ? OR firma_token = ?
  `).bind(token, token, token).first();

  if (!order) return null;

  let client = null, vehicle = null, costs = null, config = null;

  // Get client
  if (order.cliente_id) {
    client = await DB.prepare('SELECT * FROM Clientes WHERE id = ?').bind(order.cliente_id).first();
  }

  // Get vehicle
  if (order.vehiculo_id) {
    vehicle = await DB.prepare('SELECT * FROM Vehiculos WHERE id = ?').bind(order.vehiculo_id).first();
  }

  // Get costs
  costs = await DB.prepare(`
    SELECT * FROM CostosAdicionales WHERE orden_id = ?
  `).bind(order.id).all();

  // Get config
  config = await getConfig(DB);

  return { order, client, vehicle, costs, config };
}

// Build page head HTML
export function buildPageHead(title, config) {
  const bizName = escapeHtml(config?.negocio_nombre || 'BizFlow');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${bizName}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0d9488;
      --primary-dark: #0f766e;
      --primary-light: #99f6e4;
      --gray-50: #f9fafb;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-300: #d1d5db;
      --gray-400: #9ca3af;
      --gray-500: #6b7280;
      --gray-600: #4b5563;
      --gray-700: #374151;
      --gray-800: #1f2937;
      --gray-900: #111827;
      --danger: #dc2626;
      --success: #059669;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: var(--gray-50); color: var(--gray-800); line-height: 1.5; }
    .page-wrapper { max-width: 600px; margin: 0 auto; min-height: 100vh; }
    .top-bar {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white; padding: 30px 24px 20px; text-align: center;
    }
    .top-bar h1 { font-size: 1.3rem; font-weight: 700; margin-bottom: 4px; }
    .top-bar .subtitle { font-size: 0.85rem; opacity: 0.85; }
    .content { padding: 16px; }
    .card {
      background: white; border-radius: 12px; padding: 16px;
      margin-bottom: 12px; border: 1px solid var(--gray-200);
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .card-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
    }
    .card-header h2 { font-size: 0.95rem; font-weight: 700; color: var(--gray-800); }
    .icon-circle {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, #ccfbf1, #99f6e4);
      color: var(--primary); display: flex; align-items: center; justify-content: center;
      font-size: 0.9rem; flex-shrink: 0;
    }
    .info-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px solid var(--gray-100);
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { font-size: 0.85rem; color: var(--gray-500); }
    .info-value { font-size: 0.9rem; font-weight: 600; color: var(--gray-800); }
    .badge-approved { background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
    .badge-pending { background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
    .badge { padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-block; }
    .notes-box {
      background: var(--gray-50); padding: 12px; border-radius: 8px;
      font-size: 0.85rem; color: var(--gray-600); white-space: pre-wrap;
    }
    .signature-preview { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--gray-200); margin-top: 8px; }
    .btn-action {
      display: block; width: 100%; padding: 14px 20px; border: none; border-radius: 12px;
      font-size: 0.95rem; font-weight: 700; cursor: pointer; text-align: center;
      text-decoration: none; margin-bottom: 10px; transition: all 0.2s;
    }
    .btn-primary-action {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white; box-shadow: 0 4px 14px rgba(13,148,136,0.3);
    }
    .btn-pdf { background: linear-gradient(135deg, #dc2626, #991b1b); color: white; }
    .btn-whatsapp { background: linear-gradient(135deg, #25d366, #128c7e); color: white; }
    .btn-danger-outline {
      background: white; color: var(--danger); border: 2px solid var(--danger);
    }
    .btn-group-actions { margin-top: 16px; }
    .no-print { }
    @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
    .cost-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.85rem; }
    .cost-row .cost-name { color: var(--gray-600); }
    .cost-row .cost-value { font-weight: 600; color: var(--gray-800); }
    .total-row { display: flex; justify-content: space-between; padding: 10px 0 4px; border-top: 2px solid var(--gray-800); font-size: 1rem; font-weight: 800; }
    .checklist-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.85rem; color: var(--gray-600); }
    .check-item { color: var(--success); }
    .cross-item { color: var(--danger); }
    canvas#signatureCanvas { border: 2px dashed var(--gray-300); border-radius: 8px; width: 100%; height: 200px; touch-action: none; background: white; }
    @media print { .no-print { display: none !important; } .top-bar { background: white !important; color: black !important; } }
  </style>
</head>`;
}

// Build order info card
export function buildOrderInfoCard(order) {
  const num = order.numero_orden ? String(order.numero_orden).padStart(5, '0') : order.numero || '—';
  return `<div class="card">
  <div class="card-header">
    <div class="icon-circle"><i class="fas fa-clipboard-list"></i></div>
    <h2>Orden de Trabajo</h2>
  </div>
  <div class="info-row">
    <span class="info-label">Número</span>
    <span class="info-value">#${escapeHtml(String(num))}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Estado</span>
    <span class="info-value"><span class="badge badge-approved">${escapeHtml(order.estado || order.estado_trabajo || '')}</span></span>
  </div>
  <div class="info-row">
    <span class="info-label">Fecha</span>
    <span class="info-value">${escapeHtml(order.fecha_creacion || order.fecha_ingreso || '')}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Tipo</span>
    <span class="info-value">${escapeHtml(order.tipo || order.tipo_servicio || '')}</span>
  </div>
</div>`;
}

// Build client info card
export function buildClientInfoCard(client, order) {
  const name = client?.nombre || order?.cliente_nombre || order?.nombre_cliente || '—';
  const phone = client?.telefono || order?.cliente_telefono || order?.telefono || '—';
  return `<div class="card">
  <div class="card-header">
    <div class="icon-circle" style="background:#dbeafe;color:#2563eb;"><i class="fas fa-user"></i></div>
    <h2>Cliente</h2>
  </div>
  <div class="info-row">
    <span class="info-label">Nombre</span>
    <span class="info-value">${escapeHtml(name)}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Teléfono</span>
    <span class="info-value">${escapeHtml(phone)}</span>
  </div>
  ${client?.email ? `<div class="info-row"><span class="info-label">Email</span><span class="info-value">${escapeHtml(client.email)}</span></div>` : ''}
  ${client?.direccion || order?.direccion ? `<div class="info-row"><span class="info-label">Dirección</span><span class="info-value">${escapeHtml(client?.direccion || order?.direccion || '')}</span></div>` : ''}
</div>`;
}

// Build vehicle info card
export function buildVehicleInfoCard(order, vehicle) {
  const patente = vehicle?.placa || vehicle?.patente_placa || order?.patente_placa || order?.placa || '—';
  const marca = vehicle?.marca || order?.marca || '—';
  const modelo = vehicle?.modelo || order?.modelo || '—';
  const anio = vehicle?.anio || order?.anio || '';
  return `<div class="card">
  <div class="card-header">
    <div class="icon-circle" style="background:#fef3c7;color:#f59e0b;"><i class="fas fa-car"></i></div>
    <h2>Vehículo</h2>
  </div>
  <div class="info-row">
    <span class="info-label">Patente/Placa</span>
    <span class="info-value" style="font-weight:800;">${escapeHtml(patente)}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Marca</span>
    <span class="info-value">${escapeHtml(marca)}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Modelo</span>
    <span class="info-value">${escapeHtml(modelo)}</span>
  </div>
  ${anio ? `<div class="info-row"><span class="info-label">Año</span><span class="info-value">${escapeHtml(String(anio))}</span></div>` : ''}
</div>`;
}

// Build domicilio card
export function buildDomicilioCard(order) {
  const dist = parseFloat(order.distancia_km) || 0;
  const cargo = parseFloat(order.cargo_domicilio) || 0;
  if (dist === 0 && cargo === 0) return '';
  return `<div class="card">
  <div class="card-header">
    <div class="icon-circle" style="background:#ede9fe;color:#7c3aed;"><i class="fas fa-location-dot"></i></div>
    <h2>Servicio a Domicilio</h2>
  </div>
  <div class="info-row">
    <span class="info-label">Distancia</span>
    <span class="info-value">${dist.toFixed(1)} km</span>
  </div>
  <div class="info-row">
    <span class="info-label">Cargo domicilio</span>
    <span class="info-value">${cargo > 0 ? '$' + cargo.toLocaleString('es-MX') : 'Sin cargo'}</span>
  </div>
</div>`;
}

// Build services card
export function buildServicesCard(order) {
  const services = order.servicios || order.descripcion || order.trabajo_realizado || '';
  if (!services) return '';
  return `<div class="card">
  <div class="card-header">
    <div class="icon-circle" style="background:#fce7f3;color:#ec4899;"><i class="fas fa-wrench"></i></div>
    <h2>Servicios</h2>
  </div>
  <div class="notes-box">${escapeHtml(services)}</div>
</div>`;
}

// Build checklist card
export function buildChecklistCard(order) {
  const items = [];
  if (order.diagnostico) items.push({ label: 'Diagnóstico', value: order.diagnostico });
  if (order.trabajo_realizado) items.push({ label: 'Trabajo realizado', value: order.trabajo_realizado });
  if (order.recomendaciones) items.push({ label: 'Recomendaciones', value: order.recomendaciones });
  if (items.length === 0) return '';
  return `<div class="card">
  <div class="card-header">
    <div class="icon-circle" style="background:#e0e7ff;color:#4f46e5;"><i class="fas fa-list-check"></i></div>
    <h2>Detalles</h2>
  </div>
  ${items.map(i => `<div style="margin-bottom:8px;"><div style="font-size:0.8rem;color:var(--gray-500);font-weight:600;margin-bottom:2px;">${escapeHtml(i.label)}</div><div class="notes-box">${escapeHtml(i.value)}</div></div>`).join('')}
</div>`;
}

// Build costs card
export function buildCostsCard(costs) {
  if (!costs || !costs.results || costs.results.length === 0) return '';
  return `<div class="card">
  <div class="card-header">
    <div class="icon-circle" style="background:#fef3c7;color:#f59e0b;"><i class="fas fa-receipt"></i></div>
    <h2>Costos Adicionales</h2>
  </div>
  ${(costs.results || []).map(c => `<div class="cost-row">
    <span class="cost-name">${escapeHtml(c.concepto || c.nombre || '')} x${c.cantidad || 1}</span>
    <span class="cost-value">$${(parseFloat(c.total || c.precio_total || 0)).toLocaleString('es-MX')}</span>
  </div>`).join('')}
</div>`;
}

// Build totals card
export function buildTotalsCard(order) {
  const subtotal = parseFloat(order.subtotal || order.monto_subtotal || 0);
  const total = parseFloat(order.total || order.monto_total || 0);
  return `<div class="card" style="background:var(--gray-50);">
  <div class="total-row">
    <span>Subtotal</span>
    <span>$${subtotal.toLocaleString('es-MX')}</span>
  </div>
  <div class="total-row" style="font-size:1.2rem;">
    <span>TOTAL</span>
    <span style="color:var(--primary);">$${total.toLocaleString('es-MX')}</span>
  </div>
</div>`;
}

// Build notes card
export function buildNotesCard(order) {
  const notes = order.notas || order.notas_internas || '';
  if (!notes) return '';
  return `<div class="card">
  <div class="card-header">
    <div class="icon-circle" style="background:#e5e7eb;color:#374151;"><i class="fas fa-sticky-note"></i></div>
    <h2>Notas</h2>
  </div>
  <div class="notes-box">${escapeHtml(notes)}</div>
</div>`;
}

// Build signature canvas HTML
export function buildSignatureCanvasHtml() {
  return `<div class="card" id="signatureCard">
  <div class="card-header">
    <div class="icon-circle" style="background:#fce7f3;color:#ec4899;"><i class="fas fa-signature"></i></div>
    <h2>Firma Digital</h2>
  </div>
  <canvas id="signatureCanvas"></canvas>
  <div style="display:flex;gap:8px;margin-top:10px;">
    <button onclick="window.clearSignature()" style="flex:1;padding:10px;border:1px solid var(--gray-300);border-radius:8px;background:white;font-size:0.85rem;cursor:pointer;">
      <i class="fas fa-eraser me-1"></i> Borrar
    </button>
  </div>
</div>`;
}

// Build signature canvas script
export function buildSignatureCanvasScript() {
  return `<script>
(function() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasContent = false;

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width - 32;
    canvas.height = 200;
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  canvas.addEventListener('mousedown', e => { drawing = true; hasContent = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove', e => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  canvas.addEventListener('mouseup', () => { drawing = false; });
  canvas.addEventListener('mouseleave', () => { drawing = false; });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; hasContent = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
  canvas.addEventListener('touchend', () => { drawing = false; });

  window.clearSignature = function() { ctx.clearRect(0, 0, canvas.width, canvas.height); hasContent = false; };
  window.isSignatureEmpty = function() { return !hasContent; };
  window.getSignatureData = function() { return canvas.toDataURL('image/png'); };
})();
</script>`;
}

// Get jsPDF script tag
export function getJsPDFScript() {
  return `<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>`;
}

// Build jsPDF generator script
export function buildJsPDFGeneratorScript(mode) {
  return `<script>
function generatePDF() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = 210, margin = 15, contentW = pageW - margin * 2;

    // Header
    doc.setFillColor(13,148,136);
    doc.rect(0, 0, pageW, 35, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(document.getElementById('bizName')?.textContent || 'BizFlow', margin, 18);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('${mode === 'tecnico' ? 'Cierre de Orden de Trabajo' : 'Orden de Trabajo Aprobada'}', margin, 26);

    let y = 45;
    doc.setTextColor(31,41,55);

    // Helper function
    function addField(label, value) {
      if (!value) value = '—';
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(107,114,128);
      doc.text(label + ':', margin, y);
      doc.setTextColor(31,41,55);
      doc.setFont(undefined, 'bold');
      doc.text(String(value).substring(0, 80), margin + 45, y);
      y += 6;
    }

    function addSection(title) {
      y += 4;
      doc.setFillColor(243,244,246);
      doc.roundedRect(margin, y - 4, contentW, 8, 2, 2, 'F');
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(13,148,136);
      doc.text(title, margin + 4, y + 1);
      y += 8;
      doc.setTextColor(31,41,55);
    }

    // Order info
    addSection('ORDEN DE TRABAJO');
    addField('Numero', document.getElementById('orderNumber')?.textContent);
    addField('Fecha', document.getElementById('orderDate')?.textContent);
    addField('Estado', document.getElementById('orderStatus')?.textContent);

    // Client
    addSection('CLIENTE');
    addField('Nombre', document.getElementById('clientName')?.textContent);
    addField('Telefono', document.getElementById('clientPhone')?.textContent);
    addField('Direccion', document.getElementById('clientAddr')?.textContent);

    // Vehicle
    addSection('VEHICULO');
    addField('Patente', document.getElementById('vehiclePatente')?.textContent);
    addField('Marca', document.getElementById('vehicleMarca')?.textContent);
    addField('Modelo', document.getElementById('vehicleModelo')?.textContent);
    addField('Anio', document.getElementById('vehicleAnio')?.textContent);

    // Services
    const services = document.getElementById('notesText')?.textContent;
    if (services) {
      addSection('SERVICIOS / NOTAS');
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(75,85,99);
      const lines = doc.splitTextToSize(services.substring(0, 500), contentW - 8);
      for (const line of lines) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(line, margin + 4, y);
        y += 4;
      }
    }

    // Totals
    const total = document.getElementById('totalValue')?.textContent;
    if (total) {
      y += 6;
      doc.setFillColor(13,148,136);
      doc.roundedRect(margin, y - 3, contentW, 10, 2, 2, 'F');
      doc.setTextColor(255,255,255);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('TOTAL: ' + total, margin + contentW / 2 - 20, y + 4);
    }

    // Signature image
    const sigImg = document.getElementById('signatureImg');
    if (sigImg && sigImg.src) {
      try { doc.addImage(sigImg.src, 'PNG', margin + 40, y + 15, 80, 30); } catch(e) {}
    }

    doc.save('orden-trabajo.pdf');
  } catch(err) {
    alert('Error generando PDF: ' + err.message);
  }
}
</script>`;
}

// Haversine distance (km)
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calculate delivery charge
export function calcularCargoDomicilio(config, distanceKm) {
  const tarifaPorKm = parseFloat(config.domicilio_tarifa_km || 0);
  const cargoMinimo = parseFloat(config.domicilio_cargo_minimo || 0);
  const coberturaMax = parseFloat(config.domicilio_cobertura_maxima || 0);

  let cargo = distanceKm * tarifaPorKm;
  if (cargo < cargoMinimo && cargo > 0) cargo = cargoMinimo;

  if (coberturaMax > 0 && distanceKm > coberturaMax) {
    return { cargo_domicilio: -1, distancia_km: parseFloat(distanceKm.toFixed(1)) };
  }

  return {
    cargo_domicilio: parseFloat(cargo.toFixed(0)),
    distancia_km: parseFloat(distanceKm.toFixed(1)),
  };
}

// WhatsApp helpers
export function generarWaMeLink(phone, text) {
  if (!phone) return '#';
  return `https://wa.me/${phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(text || '')}`;
}

export function generarMensajeWhatsApp(evento, orden, tecnico, cliente) {
  const num = orden.numero_orden ? String(orden.numero_orden).padStart(5, '0') : '#';
  const patente = orden.patente_placa || orden.placa || '';

  const mensajes = {
    en_sitio: `Hola ${cliente?.nombre || ''}, nuestro técnico ${tecnico?.nombre || ''} ha llegado al sitio para atender su orden #${num}${patente ? ' del vehículo ' + patente : ''}.`,
    en_progreso: `Hola ${cliente?.nombre || ''}, ya estamos trabajando en su orden #${num}${patente ? ' del vehículo ' + patente : ''}.`,
    completada: `Hola ${cliente?.nombre || ''}, su orden #${num} ha sido completada. Puede retirar su vehículo.`,
    pendiente_piezas: `Hola ${cliente?.nombre || ''}, su orden #${num} está pendiente por piezas. Le notificaremos cuando estén disponibles.`,
  };

  return mensajes[evento] || `Actualización de su orden #${num}.`;
}

export async function sendWhatsApp(DB, config, { orden_id, telefono, mensaje, tipo_evento, negocio_id }) {
  // Log notification
  try {
    await DB.prepare(`
      INSERT INTO NotificacionesWhatsApp (orden_id, destinatario, tipo, mensaje, estado_envio, creado_en)
      VALUES (?, ?, ?, ?, 'pendiente', ?)
    `).bind(orden_id, telefono, tipo_evento || 'manual', mensaje, hoyISO()).run();
  } catch (e) {
    console.warn('WhatsApp log error:', e.message);
  }

  // Send via UltraMsg if configured
  const instance = config.ultramsg_instance || '';
  const token = config.ultramsg_token || '';
  if (instance && token && telefono) {
    try {
      const phone = telefono.replace(/[^0-9]/g, '');
      const resp = await fetch(`https://api.ultramsg.com/${instance}/messages/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${token}&to=${phone}&body=${encodeURIComponent(mensaje)}`,
      });
      const data = await resp.json();
      await DB.prepare(`
        UPDATE NotificacionesWhatsApp SET estado_envio = ?, respuesta = ? WHERE orden_id = ? AND tipo = ?
      `).bind(
        data.status === 'success' ? 'enviada' : 'fallida',
        JSON.stringify(data).substring(0, 500),
        orden_id, tipo_evento || 'manual'
      ).run();
    } catch (e) {
      console.warn('UltraMsg error:', e.message);
    }
  }
}

export function normalizarTelefonoChile(phone) {
  if (!phone) return '';
  return phone.replace(/[^0-9+]/g, '').replace(/^56/, '+56');
}
