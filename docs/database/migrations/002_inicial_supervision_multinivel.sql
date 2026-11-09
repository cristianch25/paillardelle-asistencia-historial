-- 6C-A: preparación revisable. NO ejecutado por la aplicación ni autorizado en producción.
-- Requiere MySQL 8.4 e inspección previa del esquema v1, respaldo y ensayo autorizado.
-- Seleccionar explícitamente asistencia_paillardelle antes de ejecutar manualmente.
-- No es idempotente: detener ante cualquier error e inspeccionar antes de continuar.
-- DDL tiene commits implícitos; estos ALTER no forman una transacción conjunta.

ALTER TABLE secciones
  DROP CHECK chk_secciones_grado,
  MODIFY COLUMN nivel ENUM('PRIMARIA','SECUNDARIA','INICIAL') NOT NULL,
  MODIFY COLUMN letra VARCHAR(30) NOT NULL,
  ADD CONSTRAINT chk_secciones_grado CHECK (
    (nivel='PRIMARIA' AND grado BETWEEN 1 AND 6)
    OR (nivel='SECUNDARIA' AND grado BETWEEN 1 AND 5)
    OR (nivel='INICIAL' AND grado IN (4,5))
  );

ALTER TABLE usuarios
  DROP CHECK chk_usuario_nivel,
  MODIFY COLUMN nivel_asignado ENUM('PRIMARIA','SECUNDARIA','INICIAL') NULL,
  ADD CONSTRAINT chk_usuario_nivel CHECK (rol <> 'SUBDIRECCION' OR nivel_asignado IS NOT NULL);

ALTER TABLE calendario_lectivo
  MODIFY COLUMN nivel ENUM('PRIMARIA','SECUNDARIA','INICIAL') NOT NULL;

ALTER TABLE bitacora_actividades
  MODIFY COLUMN nivel ENUM('PRIMARIA','SECUNDARIA','INICIAL') NOT NULL;

CREATE TABLE usuario_niveles_adicionales (
  usuario_id BIGINT UNSIGNED NOT NULL,
  nivel ENUM('PRIMARIA','SECUNDARIA','INICIAL') NOT NULL,
  PRIMARY KEY (usuario_id,nivel),
  CONSTRAINT fk_una_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Sin inserciones de datos institucionales. CHECK de SUBDIRECCION se conserva.
-- Rol SUBDIRECCION y nivel adicional distinto al principal se validan en backend,
-- bloqueando usuarios antes de leer/escribir sus niveles adicionales.
-- Verificar después SHOW CREATE TABLE y conservación de filas/IDs/FKs/índices.
