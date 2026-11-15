-- Aprobada para la etapa de asistencia diaria. Ejecución manual, nunca desde arranque/tests.
-- Precondición obligatoria del operador: asistencias e historial_asistencias VACÍAS.
-- MySQL 8.4, v1 + 002 + 003. Respaldar y ensayar antes de aplicar. DDL no transaccional.
ALTER TABLE matricula_secciones
  ADD UNIQUE KEY uq_ms_contexto (id, matricula_id, anio_escolar_id, seccion_id);

CREATE TABLE sesiones_asistencia (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  anio_escolar_id BIGINT UNSIGNED NOT NULL,
  seccion_id BIGINT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  estado ENUM('ABIERTA','CERRADA') NOT NULL DEFAULT 'ABIERTA',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  abierta_por BIGINT UNSIGNED NOT NULL,
  abierta_en DATETIME(6) NOT NULL,
  cerrada_por BIGINT UNSIGNED NULL,
  cerrada_en DATETIME(6) NULL,
  UNIQUE KEY uq_sesion_seccion_fecha (seccion_id, fecha),
  UNIQUE KEY uq_sesion_contexto (id, anio_escolar_id, seccion_id, fecha),
  KEY ix_sesion_anio_fecha (anio_escolar_id, fecha, seccion_id),
  CONSTRAINT fk_sesion_seccion FOREIGN KEY (anio_escolar_id, seccion_id)
    REFERENCES secciones(anio_escolar_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sesion_abierta_por FOREIGN KEY (abierta_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sesion_cerrada_por FOREIGN KEY (cerrada_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_sesion_version CHECK (version >= 1),
  CONSTRAINT chk_sesion_cierre CHECK (
    (estado = 'ABIERTA' AND cerrada_por IS NULL AND cerrada_en IS NULL)
    OR (estado = 'CERRADA' AND cerrada_por IS NOT NULL AND cerrada_en IS NOT NULL AND cerrada_en >= abierta_en))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE asistencias
  DROP CHECK chk_asistencia_justificada,
  DROP CHECK chk_asistencia_version,
  DROP FOREIGN KEY fk_asistencia_usuario,
  ADD sesion_id BIGINT UNSIGNED NOT NULL,
  ADD anio_escolar_id BIGINT UNSIGNED NOT NULL,
  ADD seccion_id BIGINT UNSIGNED NOT NULL,
  ADD primera_marca_en DATETIME(6) NULL,
  MODIFY estado ENUM('PRESENTE','TARDANZA','FALTA','PENDIENTE') NOT NULL,
  MODIFY registrado_por BIGINT UNSIGNED NULL,
  MODIFY version INT UNSIGNED NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_asistencia_sesion_matricula (sesion_id, matricula_id),
  ADD CONSTRAINT fk_asistencia_registrado_por FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_asistencia_sesion FOREIGN KEY (sesion_id, anio_escolar_id, seccion_id, fecha)
    REFERENCES sesiones_asistencia(id, anio_escolar_id, seccion_id, fecha) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_asistencia_contexto FOREIGN KEY (matricula_seccion_id, matricula_id, anio_escolar_id, seccion_id)
    REFERENCES matricula_secciones(id, matricula_id, anio_escolar_id, seccion_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT chk_asistencia_justificada CHECK (estado = 'FALTA' OR justificada = 0),
  ADD CONSTRAINT chk_asistencia_boolean CHECK (justificada IN (0,1)),
  ADD CONSTRAINT chk_asistencia_inicial CHECK (
    (version = 0 AND estado = 'PENDIENTE' AND registrado_por IS NULL AND primera_marca_en IS NULL)
    OR (version >= 1 AND registrado_por IS NOT NULL AND primera_marca_en IS NOT NULL));

ALTER TABLE historial_asistencias
  DROP CHECK chk_hist_antes,
  DROP CHECK chk_hist_despues,
  DROP CHECK chk_hist_cambio,
  MODIFY estado_anterior ENUM('PRESENTE','TARDANZA','FALTA','PENDIENTE') NOT NULL,
  MODIFY estado_nuevo ENUM('PRESENTE','TARDANZA','FALTA','PENDIENTE') NOT NULL,
  MODIFY fecha_modificacion DATETIME(6) NOT NULL,
  ADD tipo ENUM('PRIMERA_MARCA','CAMBIO','ANULACION','REACTIVACION') NOT NULL,
  ADD version_anterior INT UNSIGNED NOT NULL,
  ADD version_nueva INT UNSIGNED NOT NULL,
  ADD posterior_cierre TINYINT NOT NULL,
  ADD motivo VARCHAR(500) NULL,
  ADD UNIQUE KEY uq_hist_asistencia_version (asistencia_id, version_nueva),
  ADD CONSTRAINT chk_hist_antes CHECK (estado_anterior = 'FALTA' OR justificada_anterior = 0),
  ADD CONSTRAINT chk_hist_despues CHECK (estado_nuevo = 'FALTA' OR justificada_nueva = 0),
  ADD CONSTRAINT chk_hist_cambio CHECK (estado_anterior <> estado_nuevo OR justificada_anterior <> justificada_nueva),
  ADD CONSTRAINT chk_hist_boolean CHECK (justificada_anterior IN (0,1) AND justificada_nueva IN (0,1) AND posterior_cierre IN (0,1)),
  ADD CONSTRAINT chk_hist_motivo CHECK (posterior_cierre = 0 OR (motivo IS NOT NULL AND CHAR_LENGTH(TRIM(motivo)) > 0)),
  ADD CONSTRAINT chk_hist_version CHECK (version_nueva = version_anterior + 1),
  ADD CONSTRAINT chk_hist_tipo CHECK (
    (tipo = 'PRIMERA_MARCA' AND version_anterior = 0 AND estado_anterior = 'PENDIENTE' AND estado_nuevo <> 'PENDIENTE')
    OR (tipo = 'CAMBIO' AND version_anterior >= 1 AND estado_anterior <> 'PENDIENTE' AND estado_nuevo <> 'PENDIENTE' AND estado_anterior <> estado_nuevo)
    OR (tipo = 'ANULACION' AND version_anterior >= 1 AND estado_anterior <> 'PENDIENTE' AND estado_nuevo = 'PENDIENTE')
    OR (tipo = 'REACTIVACION' AND version_anterior >= 1 AND estado_anterior = 'PENDIENTE' AND estado_nuevo <> 'PENDIENTE'));
