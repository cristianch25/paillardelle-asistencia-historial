-- 7B.3: PREPARADA, NO APLICADA. MySQL 8.4; requiere v1 + 002 + 003 + 004 + 005.
-- Ejecución manual con autorización específica, nunca desde arranque ni tests.
-- Verificar SHOW CREATE TABLE, respaldo consistente y restauración ensayada.
-- No es idempotente: si falta chk_hist_motivo o difiere del CHECK de 004, detener.
-- DDL tiene commit implícito; ante un fallo inspeccionar sin reintentar automáticamente.
-- Conserva sesiones, estados de cierre, columnas, datos, versiones, claves e historial.
-- El motivo de justificación continúa protegido por los CHECK de 005.
ALTER TABLE historial_asistencias
  DROP CHECK chk_hist_motivo;
