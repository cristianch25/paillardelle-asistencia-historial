-- 7B.2: PREPARADA, NO APLICADA. MySQL 8.4; esquema v1 + 002 + 003 + 004.
-- Ejecución manual autorizada, nunca en arranque/tests. No es idempotente.
-- Inspeccionar esquema real, respaldar y ensayar restauración antes de ejecutar.
-- Detenerse si existen justificaciones previas sin motivo (también en historial).
-- No inventar motivos ni alterar históricos para satisfacer los nuevos CHECK.
-- DDL tiene commits implícitos: los dos ALTER no son una transacción conjunta.

ALTER TABLE asistencias
  DROP CHECK chk_asistencia_justificada,
  ADD motivo_justificacion VARCHAR(500) NULL,
  ADD CONSTRAINT chk_asistencia_justificada CHECK (
    (justificada = 0 AND motivo_justificacion IS NULL)
    OR (justificada = 1 AND estado IN ('FALTA','TARDANZA')
      AND motivo_justificacion IS NOT NULL AND CHAR_LENGTH(TRIM(motivo_justificacion)) > 0));

ALTER TABLE historial_asistencias
  DROP CHECK chk_hist_antes,
  DROP CHECK chk_hist_despues,
  DROP CHECK chk_hist_cambio,
  DROP CHECK chk_hist_tipo,
  ADD motivo_justificacion_anterior VARCHAR(500) NULL,
  ADD motivo_justificacion_nuevo VARCHAR(500) NULL,
  MODIFY tipo ENUM('PRIMERA_MARCA','CAMBIO','ANULACION','REACTIVACION','JUSTIFICACION') NOT NULL,
  ADD CONSTRAINT chk_hist_antes CHECK (
    (justificada_anterior = 0 AND motivo_justificacion_anterior IS NULL)
    OR (justificada_anterior = 1 AND estado_anterior IN ('FALTA','TARDANZA')
      AND motivo_justificacion_anterior IS NOT NULL AND CHAR_LENGTH(TRIM(motivo_justificacion_anterior)) > 0)),
  ADD CONSTRAINT chk_hist_despues CHECK (
    (justificada_nueva = 0 AND motivo_justificacion_nuevo IS NULL)
    OR (justificada_nueva = 1 AND estado_nuevo IN ('FALTA','TARDANZA')
      AND motivo_justificacion_nuevo IS NOT NULL AND CHAR_LENGTH(TRIM(motivo_justificacion_nuevo)) > 0)),
  ADD CONSTRAINT chk_hist_cambio CHECK (estado_anterior <> estado_nuevo
    OR justificada_anterior <> justificada_nueva
    OR NOT (motivo_justificacion_anterior <=> motivo_justificacion_nuevo)),
  ADD CONSTRAINT chk_hist_tipo CHECK (
    (tipo = 'PRIMERA_MARCA' AND version_anterior = 0 AND estado_anterior = 'PENDIENTE' AND estado_nuevo <> 'PENDIENTE')
    OR (tipo = 'CAMBIO' AND version_anterior >= 1 AND estado_anterior <> 'PENDIENTE' AND estado_nuevo <> 'PENDIENTE' AND estado_anterior <> estado_nuevo)
    OR (tipo = 'ANULACION' AND version_anterior >= 1 AND estado_anterior <> 'PENDIENTE' AND estado_nuevo = 'PENDIENTE')
    OR (tipo = 'REACTIVACION' AND version_anterior >= 1 AND estado_anterior = 'PENDIENTE' AND estado_nuevo <> 'PENDIENTE')
    OR (tipo = 'JUSTIFICACION' AND version_anterior >= 1 AND estado_anterior = estado_nuevo
      AND estado_nuevo IN ('FALTA','TARDANZA') AND justificada_anterior = 0 AND justificada_nueva = 1));
