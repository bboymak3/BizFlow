-- ============================================
-- VALIDACIÓN COMPLETA DE TABLAS - Global Pro Automotriz v2
-- Ejecutar en Cloudflare D1 Console
-- Este script es idempotente: seguro de ejecutar multiples veces
-- ============================================

-- ============================================
-- TABLA 1: AgendaTecnicos (CREAR SI NO EXISTE)
-- ============================================
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

CREATE INDEX IF NOT EXISTS idx_agenda_tecnico ON AgendaTecnicos(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_agenda_orden ON AgendaTecnicos(orden_id);
CREATE INDEX IF NOT EXISTS idx_agenda_fecha ON AgendaTecnicos(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_agenda_estado ON AgendaTecnicos(estado);

-- ============================================
-- COLUMNAS FALTANTES EN FOTOS TRABAJO
-- El código usa: url_imagen, fecha_subida, tecnico_id, tipo_foto
-- ============================================
ALTER TABLE FotosTrabajo ADD COLUMN url_imagen TEXT;
ALTER TABLE FotosTrabajo ADD COLUMN fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE FotosTrabajo ADD COLUMN tecnico_id INTEGER;

-- ============================================
-- COLUMNAS FALTANTES EN NOTAS TRABAJO
-- El código usa: nota, fecha_nota, tecnico_id
-- ============================================
ALTER TABLE NotasTrabajo ADD COLUMN nota TEXT;
ALTER TABLE NotasTrabajo ADD COLUMN fecha_nota DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE NotasTrabajo ADD COLUMN tecnico_id INTEGER;

-- ============================================
-- COLUMNAS FALTANTES EN TECNICOS
-- El código usa: pin, codigo_acceso, fecha_registro
-- ============================================
ALTER TABLE Tecnicos ADD COLUMN pin TEXT;
ALTER TABLE Tecnicos ADD COLUMN codigo_acceso TEXT;
ALTER TABLE Tecnicos ADD COLUMN fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP;

-- ============================================
-- COLUMNAS FALTANTES EN ORDENES DE TRABAJO
-- ============================================
ALTER TABLE OrdenesTrabajo ADD COLUMN fecha_programada TEXT;
ALTER TABLE OrdenesTrabajo ADD COLUMN hora_programada TEXT;
ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_email TEXT;
ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_rut TEXT;

-- ============================================
-- INDICES ADICIONALES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_ot_fecha_programada ON OrdenesTrabajo(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON Clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON Clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_tecnicos_telefono ON Tecnicos(telefono);
CREATE INDEX IF NOT EXISTS idx_tecnicos_activo ON Tecnicos(activo);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON GastosNegocio(categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto);
CREATE INDEX IF NOT EXISTS idx_costos_fecha ON CostosAdicionales(fecha_registro);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON Pagos(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_notif_tipo ON NotificacionesWhatsApp(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_seguimiento_tecnico ON SeguimientoTrabajo(tecnico_id);
