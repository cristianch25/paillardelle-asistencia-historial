-- 6D-1: preparada para revisión; NO ejecutada. Requiere autorización de ejecución.
-- Destino previsto: asistencia_paillardelle, MySQL 8.4, esquema v1 + migración 002.
-- Comprobar y seleccionar la base explícitamente antes de una ejecución autorizada.
-- No es idempotente: detener ante cualquier error; no reintentar automáticamente.
-- DDL implica commit implícito; no se ejecuta desde el arranque ni las pruebas.

CREATE TABLE periodos_lectivos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  anio_escolar_id BIGINT UNSIGNED NOT NULL,
  nivel ENUM('PRIMARIA','SECUNDARIA','INICIAL') NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT uq_periodos_inicio
    UNIQUE (anio_escolar_id, nivel, fecha_inicio),

  CONSTRAINT fk_periodos_anio
    FOREIGN KEY (anio_escolar_id)
    REFERENCES anios_escolares(id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_periodos_fechas
    CHECK (fecha_inicio <= fecha_fin)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- Sin inserciones ni modificaciones de tablas existentes.
-- UNIQUE impide el mismo inicio por año/nivel; no garantiza ausencia de solapamientos.
-- Solapamientos, límites del año, permisos, auditoría y protección de asistencias
-- se validarán posteriormente en backend mediante transacciones y bloqueos.
