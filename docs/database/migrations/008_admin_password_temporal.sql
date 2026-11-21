-- PREPARADA, NO APLICADA. Requiere MySQL 8.4 LTS, esquema v1 + 002-007.
-- Ejecucion manual con autorizacion separada. Nunca desde arranque o pruebas.
-- Verificar instancia/base y SHOW CREATE TABLE usuarios; detener si difieren.
-- Respaldar y ensayar previamente en copia autorizada. DDL tiene commit implicito.
-- No es idempotente: no reintentar automaticamente ni inferir rollback del DDL.
-- Unica ampliacion: indicador false para todas las cuentas existentes.
-- No cambia passwords, roles ni estados; no crea cuentas, tablas o version_sesion.
ALTER TABLE usuarios
  ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE;
