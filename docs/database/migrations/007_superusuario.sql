-- SUPERUSUARIO etapa 1, 20/11/2026: PREPARADA, NO APLICADA.
-- MySQL 8.4 LTS; requiere esquema v1 + 002 + 003 + 004 + 005 + 006.
-- Solo para revision. Ejecucion manual con autorizacion especifica posterior.
-- Antes: verificar destino/esquema, SHOW CREATE TABLE usuarios, ENUM original
-- exacto. Si difieren, detenerse; no adaptar a ciegas.
-- Respaldar y ensayar restauracion/aplicacion en una copia autorizada.
-- No es idempotente. DDL tiene commit implicito; no reintentar automaticamente.
-- Conservar orden de roles, atributos originales, claves, indices y CHECK.
-- Conservar chk_usuario_nivel: retirar/reponer en el mismo ALTER, como en 002.
-- No crea cuentas ni cambia passwords, roles, estados o datos originales.
-- Solo amplia el ENUM; no agrega columnas ni implementa revocacion de JWT.
-- PORTERIA, indicador de password temporal y permisos requieren otras etapas.
-- Nunca ejecutar desde el arranque, seeds o pruebas; no modifica SQL anteriores.

ALTER TABLE usuarios
  DROP CHECK chk_usuario_nivel,
  MODIFY COLUMN rol ENUM('ADMIN','SUBDIRECCION','REGISTRADOR','SUPERUSUARIO') NOT NULL,
  ADD CONSTRAINT chk_usuario_nivel CHECK (rol <> 'SUBDIRECCION' OR nivel_asignado IS NOT NULL);
