-- ============================================================
-- BizFlow - Schema D1 (SQLite)
-- CRM SaaS + Gestor de Ordenes de Trabajo + Landing Pages
-- ============================================================

-- ============================================================
-- 1. USUARIOS / ADMINISTRADORES
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
-- 2. CLIENTES (CRM)
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
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE SET NULL
);

-- ============================================================
-- 3. VEHICULOS
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
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE CASCADE
);

-- ============================================================
-- 4. CATALOGO DE SERVICIOS
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
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE SET NULL
);

-- ============================================================
-- 5. TECNICOS / OPERARIOS
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
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

-- ============================================================
-- 6. ORDENES DE TRABAJO (CORE)
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
    'completada', 'cancelada', 'aprobada', 'cerrada'
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
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id) ON DELETE SET NULL,
  FOREIGN KEY (vehiculo_id) REFERENCES Vehiculos(id) ON DELETE SET NULL,
  FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id) ON DELETE SET NULL
);

-- ============================================================
-- 7. COSTOS ADICIONALES DE OT
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
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 8. GASTOS DEL NEGOCIO
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
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

-- ============================================================
-- 9. MODELOS DE VEHICULO (CATALOGO)
-- ============================================================
CREATE TABLE IF NOT EXISTS ModelosVehiculo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  anio_desde INTEGER DEFAULT 2000,
  anio_hasta INTEGER DEFAULT 2025,
  UNIQUE(marca, modelo)
);

-- ============================================================
-- 10. NOTIFICACIONES WHATSAPP
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
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE SET NULL
);

-- ============================================================
-- 11. FOTOS DE TRABAJO (metadata en D1, archivo en R2)
-- ============================================================
CREATE TABLE IF NOT EXISTS FotosTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tipo TEXT DEFAULT 'evidencia' CHECK(tipo IN (
    'antes', 'durante', 'despues', 'evidencia', 'diagnostico', 'firma'
  )),
  descripcion TEXT DEFAULT '',
  ruta_r2 TEXT NOT NULL,
  url_publica TEXT DEFAULT '',
  subida_por TEXT DEFAULT '',
  mime_type TEXT DEFAULT 'image/jpeg',
  tamano_bytes INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 12. NOTAS DE TRABAJO (bitacora de la OT)
-- ============================================================
CREATE TABLE IF NOT EXISTS NotasTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  autor TEXT NOT NULL,
  autor_tipo TEXT DEFAULT 'admin' CHECK(autor_tipo IN ('admin', 'tecnico', 'sistema', 'cliente')),
  contenido TEXT NOT NULL,
  creado_en TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 13. SEGUIMIENTO DE OT (historial de cambios de estado)
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
-- 14. PAGOS
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
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- ============================================================
-- 15. CONFIGURACION (por usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS Configuracion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  clave TEXT NOT NULL,
  valor TEXT NOT NULL,
  actualizado_en TEXT DEFAULT (datetime('now')),
  UNIQUE(usuario_id, clave),
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
);

-- ============================================================
-- 16. CONTABILIDAD PARTIDA DOBLE
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
-- 17. INVENTARIO
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
-- 18. LANDING PAGES
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
-- 19. MEDIOS R2 (Registro centralizado de archivos en R2)
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
-- INDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON Clientes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON Clientes(email);
CREATE INDEX IF NOT EXISTS idx_vehiculos_cliente ON Vehiculos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vehiculos_placa ON Vehiculos(placa);
CREATE INDEX IF NOT EXISTS idx_ot_usuario ON OrdenesTrabajo(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ot_numero ON OrdenesTrabajo(usuario_id, numero);
CREATE INDEX IF NOT EXISTS idx_ot_estado ON OrdenesTrabajo(estado);
CREATE INDEX IF NOT EXISTS idx_ot_tecnico ON OrdenesTrabajo(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_ot_cliente ON OrdenesTrabajo(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ot_token ON OrdenesTrabajo(token_aprobacion);
CREATE INDEX IF NOT EXISTS idx_costos_orden ON CostosAdicionales(orden_id);
CREATE INDEX IF NOT EXISTS idx_fotos_orden ON FotosTrabajo(orden_id);
CREATE INDEX IF NOT EXISTS idx_notas_orden ON NotasTrabajo(orden_id);
CREATE INDEX IF NOT EXISTS idx_seguimiento_orden ON SeguimientoOT(orden_id);
CREATE INDEX IF NOT EXISTS idx_pagos_orden ON Pagos(orden_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_orden ON NotificacionesWhatsApp(orden_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_estado ON NotificacionesWhatsApp(estado_envio);
CREATE INDEX IF NOT EXISTS idx_landing_slug ON LandingPages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_usuario ON LandingPages(usuario_id);
CREATE INDEX IF NOT EXISTS idx_medios_tipo ON MediosR2(tipo_recurso);
CREATE INDEX IF NOT EXISTS idx_medios_recurso ON MediosR2(tipo_recurso, recurso_id);
CREATE INDEX IF NOT EXISTS idx_inventario_usuario ON Inventario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_usuario ON CuentasContables(usuario_id);
CREATE INDEX IF NOT EXISTS idx_asientos_usuario ON AsientosContables(usuario_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_asiento ON MovimientosContables(asiento_id);

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Crear admin si no existe
INSERT OR IGNORE INTO Usuarios (email, password_hash, nombre, rol, empresa) VALUES
('admin@bizflow.com', 'g10hvh', 'Administrador', 'admin', 'BizFlow');

-- Corregir password si ya existe con hash viejo o texto plano
UPDATE Usuarios SET password_hash = 'g10hvh' WHERE email = 'admin@bizflow.com' AND (password_hash = 'admin123' OR password_hash IS NULL OR password_hash = '');

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
