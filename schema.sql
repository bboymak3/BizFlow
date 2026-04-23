-- ============================================================
-- BizFlow + Globalprov2 - Merged Schema (SQLite / D1)
-- CRM SaaS + Automotive Workshop Management
-- ============================================================

-- ============================================================
-- 1. USUARIOS / ADMINISTRADORES (BizFlow - unchanged)
-- ============================================================
CREATE TABLE IF NOT EXISTS Usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT DEFAULT 'admin' CHECK(rol IN ('admin', 'manager', 'user')),
  empresa TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 2. ADMIN USERS (Globalprov2 - admin panel authentication)
-- ============================================================
CREATE TABLE IF NOT EXISTS AdminUsers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 3. SESIONES ADMIN (Globalprov2 - session tokens)
-- ============================================================
CREATE TABLE IF NOT EXISTS SesionesAdmin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES AdminUsers(id) ON DELETE CASCADE
);

-- ============================================================
-- 4. CLIENTES (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS Clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  empresa TEXT DEFAULT '',
  nombre TEXT NOT NULL,
  apellido TEXT DEFAULT '',
  cedula_rif TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  telefono2 TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  ciudad TEXT DEFAULT '',
  estado TEXT DEFAULT '',
  codigo_postal TEXT DEFAULT '',
  notas TEXT DEFAULT '',
  origen TEXT DEFAULT 'manual' CHECK(origen IN ('manual', 'landing', 'whatsapp', 'referido')),
  landing_page_id INTEGER,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  rut TEXT DEFAULT '',
  patente TEXT DEFAULT '',
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE SET NULL
);

-- ============================================================
-- 5. VEHICULOS (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS Vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  placa TEXT NOT NULL,
  marca TEXT DEFAULT '',
  modelo TEXT DEFAULT '',
  anio INTEGER DEFAULT 0,
  color TEXT DEFAULT '',
  vin TEXT DEFAULT '',
  kilometraje INTEGER DEFAULT 0,
  notas TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  patente_placa TEXT DEFAULT '',
  cilindrada TEXT DEFAULT '',
  combustible TEXT DEFAULT '',
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE CASCADE
);

-- ============================================================
-- 6. CATALOGO DE SERVICIOS (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS ServiciosCatalogo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  precio REAL DEFAULT 0,
  duracion_minutos INTEGER DEFAULT 60,
  categoria TEXT DEFAULT 'general',
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  precio_sugerido REAL DEFAULT 0,
  tipo_comision TEXT DEFAULT 'mano_obra',
  fecha_registro TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE SET NULL
);

-- ============================================================
-- 7. TECNICOS / OPERARIOS (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS Tecnicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  especialidad TEXT DEFAULT 'general',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  latitud REAL DEFAULT 0,
  longitud REAL DEFAULT 0,
  ubicacion_actual TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  comision_porcentaje REAL DEFAULT 40,
  password TEXT DEFAULT '',
  token TEXT DEFAULT '',
  pin TEXT DEFAULT '',
  codigo_acceso TEXT DEFAULT '',
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

-- ============================================================
-- 8. ORDENES DE TRABAJO (BizFlow + Globalprov2 - CORE)
-- ============================================================
CREATE TABLE IF NOT EXISTS OrdenesTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  numero INTEGER NOT NULL,
  cliente_id INTEGER,
  vehiculo_id INTEGER,
  tecnico_id INTEGER,
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN (
    'pendiente', 'asignada', 'en_proceso', 'pausada',
    'completada', 'cancelada', 'aprobada', 'cerrada',
    'ingresada', 'diagnosticando', 'esperando_repuestos',
    'lista_para_entrega', 'entregada'
  )),
  tipo TEXT DEFAULT 'mantenimiento',
  prioridad TEXT DEFAULT 'normal' CHECK(prioridad IN ('baja', 'normal', 'alta', 'urgente')),
  titulo TEXT DEFAULT '',
  descripcion TEXT DEFAULT '',
  diagnostico TEXT DEFAULT '',
  trabajo_realizado TEXT DEFAULT '',
  recomendaciones TEXT DEFAULT '',
  fecha_creacion TEXT DEFAULT (datetime('now')),
  fecha_asignacion TEXT DEFAULT '',
  fecha_inicio TEXT DEFAULT '',
  fecha_fin TEXT DEFAULT '',
  fecha_aprobacion_cliente TEXT DEFAULT '',
  latitud_ubicacion REAL DEFAULT 0,
  longitud_ubicacion REAL DEFAULT 0,
  subtotal REAL DEFAULT 0,
  impuesto REAL DEFAULT 0,
  total REAL DEFAULT 0,
  metodo_pago TEXT DEFAULT '' CHECK(metodo_pago IN ('efectivo', 'transferencia', 'tarjeta', 'punto_venta', 'mixto', '')),
  token_aprobacion TEXT UNIQUE,
  token_aprobacion_tecnico TEXT UNIQUE,
  firma_cliente TEXT DEFAULT '',
  firma_tecnico TEXT DEFAULT '',
  aprobada_por_cliente INTEGER DEFAULT 0,
  aprobada_por_tecnico INTEGER DEFAULT 0,
  calificacion INTEGER DEFAULT 0,
  comentario_calificacion TEXT DEFAULT '',
  origen TEXT DEFAULT 'manual' CHECK(origen IN ('manual', 'landing', 'whatsapp', 'web')),
  notas_internas TEXT DEFAULT '',
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  numero_orden TEXT DEFAULT '',
  token TEXT DEFAULT '',
  patente_placa TEXT DEFAULT '',
  fecha_ingreso TEXT DEFAULT '',
  hora_ingreso TEXT DEFAULT '',
  recepcionista TEXT DEFAULT '',
  marca TEXT DEFAULT '',
  modelo TEXT DEFAULT '',
  anio TEXT DEFAULT '',
  cilindrada TEXT DEFAULT '',
  combustible TEXT DEFAULT '',
  kilometraje TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  trabajo_frenos INTEGER DEFAULT 0,
  detalle_frenos TEXT DEFAULT '',
  trabajo_luces INTEGER DEFAULT 0,
  detalle_luces TEXT DEFAULT '',
  trabajo_tren_delantero INTEGER DEFAULT 0,
  detalle_tren_delantero TEXT DEFAULT '',
  trabajo_correas INTEGER DEFAULT 0,
  detalle_correas TEXT DEFAULT '',
  trabajo_componentes INTEGER DEFAULT 0,
  detalle_componentes TEXT DEFAULT '',
  nivel_combustible TEXT DEFAULT '',
  check_paragolfe_delantero_der INTEGER DEFAULT 0,
  check_puerta_delantera_der INTEGER DEFAULT 0,
  check_puerta_trasera_der INTEGER DEFAULT 0,
  check_paragolfe_trasero_izq INTEGER DEFAULT 0,
  check_otros_carroceria INTEGER DEFAULT 0,
  monto_total REAL DEFAULT 0,
  monto_abono REAL DEFAULT 0,
  monto_restante REAL DEFAULT 0,
  firma_imagen TEXT DEFAULT '',
  fecha_aprobacion TEXT DEFAULT '',
  completo INTEGER DEFAULT 0,
  es_express INTEGER DEFAULT 0,
  estado_trabajo TEXT DEFAULT '',
  tecnico_asignado_id INTEGER,
  cliente_nombre TEXT DEFAULT '',
  cliente_telefono TEXT DEFAULT '',
  motivo_cancelacion TEXT DEFAULT '',
  fecha_cancelacion TEXT DEFAULT '',
  pagado INTEGER DEFAULT 0,
  notas TEXT DEFAULT '',
  referencia_direccion TEXT DEFAULT '',
  distancia_km REAL DEFAULT 0,
  cargo_domicilio REAL DEFAULT 0,
  domicilio_modo_cobro TEXT DEFAULT '',
  diagnostico_checks TEXT DEFAULT '',
  diagnostico_observaciones TEXT DEFAULT '',
  servicios_seleccionados TEXT DEFAULT '',
  fecha_completado TEXT DEFAULT '',
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL,
  FOREIGN KEY (vehiculo_id) REFERENCES Vehiculos(id) ON DELETE SET NULL,
  FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id) ON DELETE SET NULL,
  FOREIGN KEY (tecnico_asignado_id) REFERENCES Tecnicos(id) ON DELETE SET NULL
);

-- ============================================================
-- 9. COSTOS ADICIONALES DE OT (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS CostosAdicionales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  concepto TEXT NOT NULL,
  cantidad INTEGER DEFAULT 1,
  precio_unitario REAL DEFAULT 0,
  total REAL DEFAULT 0,
  tipo TEXT DEFAULT 'repuesto' CHECK(tipo IN ('repuesto', 'servicio', 'mano_obra', 'otro')),
  creado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  monto REAL DEFAULT 0,
  categoria TEXT DEFAULT 'Mano de Obra',
  fecha_registro TEXT DEFAULT (datetime('now')),
  registrado_por TEXT DEFAULT '',
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 10. GASTOS DEL NEGOCIO (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS GastosNegocio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  categoria TEXT DEFAULT 'operativo',
  fecha TEXT DEFAULT (datetime('now')),
  descripcion TEXT DEFAULT '',
  comprobante TEXT DEFAULT '',
  creado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  fecha_gasto TEXT DEFAULT '',
  observaciones TEXT DEFAULT '',
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

-- ============================================================
-- 11. MODELOS DE VEHICULO (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS ModelosVehiculo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  anio_desde INTEGER DEFAULT 2000,
  anio_hasta INTEGER DEFAULT 2025,
  -- Globalprov2 columns
  nombre TEXT DEFAULT '',
  fecha_registro TEXT DEFAULT (datetime('now')),
  UNIQUE(marca, modelo)
);

-- ============================================================
-- 12. NOTIFICACIONES WHATSAPP (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS NotificacionesWhatsApp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER,
  destinatario TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN (
    'nueva_orden', 'asignada_tecnico', 'cambio_estado',
    'completada', 'aprobacion_pendiente', 'aprobada',
    'cancelada', 'recordatorio', 'encuesta'
  )),
  mensaje TEXT NOT NULL,
  estado_envio TEXT DEFAULT 'pendiente' CHECK(estado_envio IN ('pendiente', 'enviada', 'fallida', 'leida')),
  respuesta TEXT DEFAULT '',
  error TEXT DEFAULT '',
  enviado_en TEXT,
  creado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  telefono TEXT DEFAULT '',
  tipo_evento TEXT DEFAULT '',
  enviada INTEGER DEFAULT 0,
  fecha_creacion TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE SET NULL
);

-- ============================================================
-- 13. PAGOS (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS Pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  monto REAL NOT NULL,
  metodo TEXT DEFAULT 'efectivo' CHECK(metodo IN ('efectivo', 'transferencia', 'tarjeta', 'punto_venta', 'mixto')),
  referencia TEXT DEFAULT '',
  fecha_pago TEXT DEFAULT (datetime('now')),
  notas TEXT DEFAULT '',
  creado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 columns
  metodo_pago TEXT DEFAULT '',
  observaciones TEXT DEFAULT '',
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 14. CONFIGURACION (BizFlow + Globalprov2)
-- ============================================================
CREATE TABLE IF NOT EXISTS Configuracion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  clave TEXT NOT NULL,
  valor TEXT NOT NULL,
  actualizado_en TEXT DEFAULT (datetime('now')),
  -- Globalprov2 column (used in global row id=1)
  ultimo_numero_orden INTEGER DEFAULT 0,
  UNIQUE(usuario_id, clave),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

-- ============================================================
-- 15. CONFIG KV (Globalprov2 - global key-value store)
-- ============================================================
CREATE TABLE IF NOT EXISTS ConfigKV (
  clave TEXT PRIMARY KEY,
  valor TEXT DEFAULT '',
  actualizado_en TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 15b. AGENDA TECNICOS (Global Pro Automotriz)
-- Calendario de agendamiento por técnico
-- ============================================================
CREATE TABLE IF NOT EXISTS AgendaTecnicos (
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
  fecha_creacion TEXT DEFAULT (datetime('now', '-3 hours')),
  FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id),
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id)
);

-- ============================================================
-- 16. FOTOS DE TRABAJO (BizFlow - unchanged)
-- metadata en D1, archivo en R2
-- ============================================================
CREATE TABLE IF NOT EXISTS FotosTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tipo TEXT DEFAULT 'evidencia' CHECK(tipo IN (
    'antes', 'durante', 'despues', 'evidencia', 'diagnostico', 'firma'
  )),
  tipo_foto TEXT,
  descripcion TEXT DEFAULT '',
  ruta_r2 TEXT DEFAULT '',
  url_imagen TEXT DEFAULT '',
  url_publica TEXT DEFAULT '',
  subida_por TEXT DEFAULT '',
  mime_type TEXT DEFAULT 'image/jpeg',
  tamano_bytes INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now')),
  fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
  tecnico_id INTEGER,
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 17. NOTAS DE TRABAJO (BizFlow - unchanged)
-- bitacora de la OT
-- ============================================================
CREATE TABLE IF NOT EXISTS NotasTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  autor TEXT DEFAULT '',
  autor_tipo TEXT DEFAULT 'admin' CHECK(autor_tipo IN ('admin', 'tecnico', 'sistema', 'cliente')),
  contenido TEXT DEFAULT '',
  nota TEXT,
  creado_en TEXT DEFAULT (datetime('now')),
  fecha_nota DATETIME DEFAULT CURRENT_TIMESTAMP,
  tecnico_id INTEGER,
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 18. SEGUIMIENTO DE OT (BizFlow - unchanged)
-- historial de cambios de estado
-- ============================================================
CREATE TABLE IF NOT EXISTS SeguimientoOT (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  estado_anterior TEXT DEFAULT '',
  estado_nuevo TEXT NOT NULL,
  realizado_por TEXT NOT NULL,
  realizado_por_tipo TEXT DEFAULT 'admin',
  notas TEXT DEFAULT '',
  latitud REAL DEFAULT 0,
  longitud REAL DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 19. SEGUIMIENTO TRABAJO (Globalprov2)
-- seguimiento tecnico con geolocalizacion
-- ============================================================
CREATE TABLE IF NOT EXISTS SeguimientoTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tecnico_id INTEGER,
  estado_anterior TEXT DEFAULT '',
  estado_nuevo TEXT DEFAULT '',
  latitud REAL DEFAULT 0,
  longitud REAL DEFAULT 0,
  observaciones TEXT DEFAULT '',
  fecha_registro TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE,
  FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id) ON DELETE SET NULL
);

-- ============================================================
-- 20. CONTABILIDAD PARTIDA DOBLE (BizFlow - unchanged)
-- ============================================================
CREATE TABLE IF NOT EXISTS CuentasContables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto')),
  descripcion TEXT DEFAULT '',
  activa INTEGER DEFAULT 1,
  UNIQUE(usuario_id, codigo),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS AsientosContables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  numero TEXT NOT NULL,
  fecha TEXT DEFAULT (datetime('now')),
  concepto TEXT NOT NULL,
  tipo_fuente TEXT DEFAULT 'manual' CHECK(tipo_fuente IN ('manual', 'ot', 'gasto', 'pago', 'factura')),
  fuente_id INTEGER DEFAULT NULL,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MovimientosContables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asiento_id INTEGER NOT NULL,
  cuenta_id INTEGER NOT NULL,
  debe REAL DEFAULT 0,
  haber REAL DEFAULT 0,
  descripcion TEXT DEFAULT '',
  FOREIGN KEY (asiento_id) REFERENCES AsientosContables(id) ON DELETE CASCADE,
  FOREIGN KEY (cuenta_id) REFERENCES CuentasContables(id) ON DELETE CASCADE
);

-- ============================================================
-- 21. INVENTARIO (BizFlow - unchanged)
-- ============================================================
CREATE TABLE IF NOT EXISTS Inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  codigo TEXT DEFAULT '',
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  categoria TEXT DEFAULT 'general',
  cantidad INTEGER DEFAULT 0,
  cantidad_minima INTEGER DEFAULT 5,
  precio_compra REAL DEFAULT 0,
  precio_venta REAL DEFAULT 0,
  proveedor TEXT DEFAULT '',
  ubicacion TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MovimientosInventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad INTEGER NOT NULL,
  orden_id INTEGER,
  concepto TEXT DEFAULT '',
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (inventario_id) REFERENCES Inventario(id) ON DELETE CASCADE,
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE SET NULL
);

-- ============================================================
-- 22. LANDING PAGES (BizFlow - unchanged)
-- ============================================================
CREATE TABLE IF NOT EXISTS LandingPages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  descripcion TEXT DEFAULT '',
  contenido_json TEXT NOT NULL DEFAULT '{}',
  html_personalizado TEXT DEFAULT '',
  css_personalizado TEXT DEFAULT '',
  logo_r2 TEXT DEFAULT '',
  favicon_r2 TEXT DEFAULT '',
  bg_image_r2 TEXT DEFAULT '',
  color_principal TEXT DEFAULT '#2563eb',
  color_secundario TEXT DEFAULT '#1e40af',
  fuente TEXT DEFAULT 'Inter',
  formulario_activo INTEGER DEFAULT 1,
  campos_formulario TEXT DEFAULT '["nombre","email","telefono","mensaje"]',
  boton_cta_texto TEXT DEFAULT 'Contáctanos',
  boton_cta_url TEXT DEFAULT '#contacto',
  seo_titulo TEXT DEFAULT '',
  seo_descripcion TEXT DEFAULT '',
  seo_keywords TEXT DEFAULT '',
  google_analytics TEXT DEFAULT '',
  facebook_pixel TEXT DEFAULT '',
  publica INTEGER DEFAULT 1,
  visitas INTEGER DEFAULT 0,
  conversiones INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS LandingPageConversiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  landing_page_id INTEGER NOT NULL,
  nombre TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  mensaje TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (landing_page_id) REFERENCES LandingPages(id) ON DELETE CASCADE
);

-- ============================================================
-- 23. MEDIOS R2 (BizFlow - unchanged)
-- Registro centralizado de archivos en R2
-- ============================================================
CREATE TABLE IF NOT EXISTS MediosR2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  ruta TEXT NOT NULL,
  nombre_original TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  tamano_bytes INTEGER DEFAULT 0,
  tipo_recurso TEXT DEFAULT 'otro' CHECK(tipo_recurso IN (
    'foto_ot', 'firma', 'avatar', 'logo', 'landing_bg', 'landing_image',
    'documento', 'comprobante', 'otro'
  )),
  recurso_id INTEGER DEFAULT NULL,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE SET NULL
);

-- ============================================================
-- INDICES (BizFlow existing + new Globalprov2 indexes)
-- ============================================================

-- Clientes
CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON Clientes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON Clientes(email);
CREATE INDEX IF NOT EXISTS idx_clientes_rut ON Clientes(rut);
CREATE INDEX IF NOT EXISTS idx_clientes_patente ON Clientes(patente);

-- Vehiculos
CREATE INDEX IF NOT EXISTS idx_vehiculos_cliente ON Vehiculos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vehiculos_placa ON Vehiculos(placa);
CREATE INDEX IF NOT EXISTS idx_vehiculos_patente_placa ON Vehiculos(patente_placa);

-- Ordenes de Trabajo
CREATE INDEX IF NOT EXISTS idx_ot_usuario ON OrdenesTrabajo(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ot_numero ON OrdenesTrabajo(usuario_id, numero);
CREATE INDEX IF NOT EXISTS idx_ot_estado ON OrdenesTrabajo(estado);
CREATE INDEX IF NOT EXISTS idx_ot_tecnico ON OrdenesTrabajo(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_ot_cliente ON OrdenesTrabajo(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ot_token ON OrdenesTrabajo(token_aprobacion);
CREATE INDEX IF NOT EXISTS idx_ot_token_gp2 ON OrdenesTrabajo(token);
CREATE INDEX IF NOT EXISTS idx_ot_numero_orden ON OrdenesTrabajo(numero_orden);
CREATE INDEX IF NOT EXISTS idx_ot_patente_placa ON OrdenesTrabajo(patente_placa);
CREATE INDEX IF NOT EXISTS idx_ot_estado_trabajo ON OrdenesTrabajo(estado_trabajo);
CREATE INDEX IF NOT EXISTS idx_ot_tecnico_asignado ON OrdenesTrabajo(tecnico_asignado_id);
CREATE INDEX IF NOT EXISTS idx_ot_fecha_ingreso ON OrdenesTrabajo(fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_ot_pagado ON OrdenesTrabajo(pagado);
CREATE INDEX IF NOT EXISTS idx_ot_completo ON OrdenesTrabajo(completo);

-- Costos Adicionales
CREATE INDEX IF NOT EXISTS idx_costos_orden ON CostosAdicionales(orden_id);
CREATE INDEX IF NOT EXISTS idx_costos_categoria ON CostosAdicionales(categoria);

-- Fotos
CREATE INDEX IF NOT EXISTS idx_fotos_orden ON FotosTrabajo(orden_id);

-- Notas
CREATE INDEX IF NOT EXISTS idx_notas_orden ON NotasTrabajo(orden_id);

-- Seguimiento OT
CREATE INDEX IF NOT EXISTS idx_seguimiento_orden ON SeguimientoOT(orden_id);

-- Seguimiento Trabajo
CREATE INDEX IF NOT EXISTS idx_seguimiento_trabajo_orden ON SeguimientoTrabajo(orden_id);
CREATE INDEX IF NOT EXISTS idx_seguimiento_trabajo_tecnico ON SeguimientoTrabajo(tecnico_id);

-- Pagos
CREATE INDEX IF NOT EXISTS idx_pagos_orden ON Pagos(orden_id);

-- WhatsApp
CREATE INDEX IF NOT EXISTS idx_whatsapp_orden ON NotificacionesWhatsApp(orden_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_estado ON NotificacionesWhatsApp(estado_envio);
CREATE INDEX IF NOT EXISTS idx_whatsapp_telefono ON NotificacionesWhatsApp(telefono);
CREATE INDEX IF NOT EXISTS idx_whatsapp_enviada ON NotificacionesWhatsApp(enviada);

-- Landing Pages
CREATE INDEX IF NOT EXISTS idx_landing_slug ON LandingPages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_usuario ON LandingPages(usuario_id);

-- Medios R2
CREATE INDEX IF NOT EXISTS idx_medios_tipo ON MediosR2(tipo_recurso);
CREATE INDEX IF NOT EXISTS idx_medios_recurso ON MediosR2(tipo_recurso, recurso_id);

-- Inventario
CREATE INDEX IF NOT EXISTS idx_inventario_usuario ON Inventario(usuario_id);

-- Contabilidad
CREATE INDEX IF NOT EXISTS idx_cuentas_usuario ON CuentasContables(usuario_id);
CREATE INDEX IF NOT EXISTS idx_asientos_usuario ON AsientosContables(usuario_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_asiento ON MovimientosContables(asiento_id);

-- Admin
CREATE INDEX IF NOT EXISTS idx_sesiones_admin_token ON SesionesAdmin(token);
CREATE INDEX IF NOT EXISTS idx_sesiones_admin_admin ON SesionesAdmin(admin_id);

-- Config KV
-- (clave is PRIMARY KEY, no separate index needed)

-- AgendaTecnicos
CREATE INDEX IF NOT EXISTS idx_agenda_tecnico ON AgendaTecnicos(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_agenda_orden ON AgendaTecnicos(orden_id);
CREATE INDEX IF NOT EXISTS idx_agenda_fecha ON AgendaTecnicos(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_agenda_estado ON AgendaTecnicos(estado);

-- OrdenesTrabajo extra indexes
CREATE INDEX IF NOT EXISTS idx_ot_fecha_programada ON OrdenesTrabajo(fecha_programada);

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Crear admin BizFlow si no existe
INSERT OR IGNORE INTO Usuarios (email, password_hash, nombre, rol, empresa) VALUES
('admin@bizflow.com', 'g10hvh', 'Administrador', 'admin', 'BizFlow');

-- Corregir password si ya existe con hash viejo o texto plano
UPDATE Usuarios SET password_hash = 'g10hvh' WHERE email = 'admin@bizflow.com' AND (password_hash = 'admin123' OR password_hash IS NULL OR password_hash = '');

-- Crear admin Globalprov2 si no existe
INSERT OR IGNORE INTO AdminUsers (username, password_hash, nombre) VALUES
('admin', 'admin123_hashed_change_me', 'Administrador Globalprov2');

-- Modelos de Vehiculo (BizFlow seed data)
INSERT OR IGNORE INTO ModelosVehiculo (marca, modelo, anio_desde, anio_hasta) VALUES
('Toyota', 'Corolla', 2015, 2025),
('Toyota', 'Hilux', 2016, 2025),
('Toyota', 'Camry', 2017, 2025),
('Honda', 'Civic', 2016, 2025),
('Honda', 'CR-V', 2018, 2025),
('Chevrolet', 'Spark', 2015, 2025),
('Chevrolet', 'Tracker', 2019, 2025),
('Mazda', '3', 2017, 2025),
('Mazda', 'CX-5', 2018, 2025),
('Kia', 'Rio', 2018, 2025),
('Kia', 'Sportage', 2019, 2025),
('Hyundai', 'Accent', 2017, 2025),
('Hyundai', 'Tucson', 2019, 2025),
('Nissan', 'Sentra', 2016, 2025),
('Nissan', 'Kicks', 2018, 2025),
('Volkswagen', 'Polo', 2018, 2025),
('Volkswagen', 'Golf', 2017, 2025),
('Ford', 'EcoSport', 2018, 2025),
('Ford', 'Ranger', 2019, 2025),
('Renault', 'Kwid', 2019, 2025),
('Renault', 'Duster', 2018, 2025),
('BYD', 'Dolphin', 2023, 2025),
('BYD', 'Atto 3', 2023, 2025),
('Tesla', 'Model 3', 2020, 2025),
('Tesla', 'Model Y', 2021, 2025);

-- Globalprov2 ConfigKV initial values
INSERT OR IGNORE INTO ConfigKV (clave, valor) VALUES
('ultimo_numero_orden', '0'),
('nombre_negocio', 'Globalprov2'),
('moneda', 'CLP'),
('tasa_impuesto', '19'),
('url_base', ''),
('whatsapp_api_url', ''),
('whatsapp_api_token', ''),
('whatsapp_numero_remitente', ''),
('google_maps_api_key', ''),
('umbral_bajo_combustible', '25'),
('radio_busqueda_km', '50'),
('cargo_domicilio_base', '0'),
('cargo_domicilio_por_km', '0');
