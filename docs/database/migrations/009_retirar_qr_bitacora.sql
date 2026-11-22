-- PREPARADA, NO EJECUTADA. Solo revision; requiere autorizacion posterior.
-- MySQL 8.4, esquema v1 + 002-008 y codigo desacoplado de d76c909.
-- Leer 009_retirar_qr_bitacora.md ANTES de cualquier ejecucion autorizada.
-- Cliente con soporte DELIMITER y detencion en el PRIMER error, nunca --force.
-- No ejecutar sentencias sueltas ni incluir en arneses historicos.
-- Escritores detenidos durante toda la operacion, incluidos scripts y eventos.
-- DDL con commits implicitos: no atomico ni reversible mediante ROLLBACK.
-- No usar dentro de una transaccion; la creacion de la rutina ya implica DDL.
-- Variables de sesion obligatorias, SIN valores predeterminados:
-- @m009_uuid, @m009_hostname, @m009_port: identidad verificada del servidor.
-- @m009_confirmacion: '009 RESPALDO VERIFICADO Y ESCRITORES DETENIDOS'.
-- La rutina es auxiliar de esta migracion, SQL SECURITY INVOKER, no de la app.
-- Si ya existe su nombre, detenerse; no reemplazar ni invocar una rutina previa.

DELIMITER $$
CREATE PROCEDURE asistencia_paillardelle._migracion_009_retirar_legado()
SQL SECURITY INVOKER
MODIFIES SQL DATA
BEGIN
  DECLARE esperadas JSON;
  DECLARE relaciones JSON;

  IF NOT COALESCE(
    BINARY DATABASE() = BINARY 'asistencia_paillardelle'
    AND VERSION() LIKE '8.4.%'
    AND @m009_uuid REGEXP '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    AND LOWER(@m009_uuid) = LOWER(@@server_uuid)
    AND BINARY @m009_hostname = BINARY @@hostname
    AND @m009_port = @@port
    AND BINARY @m009_confirmacion = BINARY '009 RESPALDO VERIFICADO Y ESCRITORES DETENIDOS'
    AND @@session.foreign_key_checks = 1 AND @@session.autocommit = 1
    AND @@session.group_concat_max_len >= 1024, FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: destino, confirmacion o sesion no autorizados.';
  END IF;

  -- Inventario exacto previo: 20 tablas base InnoDB, ninguna vista adicional.
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) <> 20
    OR EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND
      (TABLE_TYPE <> 'BASE TABLE' OR NOT (ENGINE <=> 'InnoDB') OR TABLE_NAME NOT IN (
        'anios_escolares','asignaciones','asistencias','auditoria_administrativa',
        'bitacora_actividades','calendario_lectivo','configuracion_sistema','contactos',
        'credenciales_qr','estudiante_contactos','estudiantes','historial_asistencias',
        'matricula_secciones','matriculas','periodos_lectivos','registros_ingreso',
        'secciones','sesiones_asistencia','usuario_niveles_adicionales','usuarios'))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: inventario previo incompatible; no se elimina nada.';
  END IF;

  -- Firma de nombres, tipos, nulabilidad y orden de columnas afectadas.
  -- Incluye usuarios completo: exige SUPERUSUARIO y debe_cambiar_password (008).
  SET esperadas = JSON_ARRAY(
    JSON_ARRAY('registros_ingreso', 'id:bigint unsigned:NO|matricula_id:bigint unsigned:NO|credencial_qr_id:bigint unsigned:NO|fecha:date:NO|hora_ingreso:time:NO|registrado_por:bigint unsigned:NO|created_at:datetime:NO'),
    JSON_ARRAY('credenciales_qr', 'id:bigint unsigned:NO|matricula_id:bigint unsigned:NO|token_hash:char(64):NO|estado:enum(''ACTIVA'',''REVOCADA''):NO|fecha_emision:datetime:NO|fecha_revocacion:datetime:YES|emitido_por:bigint unsigned:NO|matricula_qr_activa:bigint unsigned:YES'),
    JSON_ARRAY('bitacora_actividades', 'id:bigint unsigned:NO|usuario_id:bigint unsigned:NO|nivel:enum(''PRIMARIA'',''SECUNDARIA'',''INICIAL''):NO|fecha:date:NO|descripcion:text:NO|created_at:datetime:NO|updated_at:datetime:NO'),
    JSON_ARRAY('configuracion_sistema', 'id:bigint unsigned:NO|clave:varchar(100):NO|valor:varchar(255):NO|descripcion:varchar(255):YES|updated_by:bigint unsigned:YES|updated_at:datetime:NO'),
    JSON_ARRAY('usuarios', 'id:bigint unsigned:NO|nombres:varchar(100):NO|apellidos:varchar(120):NO|usuario:varchar(60):NO|password_hash:varchar(255):NO|rol:enum(''ADMIN'',''SUBDIRECCION'',''REGISTRADOR'',''SUPERUSUARIO''):NO|cargo:varchar(30):YES|nivel_asignado:enum(''PRIMARIA'',''SECUNDARIA'',''INICIAL''):YES|puede_escanear_qr:tinyint(1):NO|puede_usar_bitacora:tinyint(1):NO|activo:tinyint(1):NO|created_at:datetime:NO|updated_at:datetime:NO|debe_cambiar_password:tinyint(1):NO')
  );
  IF EXISTS (SELECT 1 FROM JSON_TABLE(esperadas, '$[*]' COLUMNS (
      tabla VARCHAR(64) PATH '$[0]', firma VARCHAR(2000) PATH '$[1]')) e
    WHERE NOT (BINARY e.firma <=> BINARY (SELECT GROUP_CONCAT(
      CONCAT(c.COLUMN_NAME, ':', c.COLUMN_TYPE, ':', c.IS_NULLABLE)
      ORDER BY c.ORDINAL_POSITION SEPARATOR '|') FROM information_schema.COLUMNS c
      WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = e.tabla))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: columnas distintas de v1 + 002-008.';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios' AND COLUMN_NAME IN ('puede_escanear_qr','puede_usar_bitacora')
      AND COLUMN_DEFAULT = '0' AND EXTRA = '' AND GENERATION_EXPRESSION = '') <> 2
    OR EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios' AND COLUMN_NAME IN ('puede_escanear_qr','puede_usar_bitacora'))
    OR EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CHECK_CLAUSE REGEXP 'puede_escanear_qr|puede_usar_bitacora') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: defaults o dependencias de indicadores incompatibles.';
  END IF;

  -- Siete FK esperadas; ocho componentes por la FK compuesta QR/matricula.
  SET relaciones = JSON_ARRAY(
    JSON_ARRAY('fk_ingreso_matricula','registros_ingreso','matricula_id',1,'matriculas','id'),
    JSON_ARRAY('fk_ingreso_qr_matricula','registros_ingreso','credencial_qr_id',1,'credenciales_qr','id'),
    JSON_ARRAY('fk_ingreso_qr_matricula','registros_ingreso','matricula_id',2,'credenciales_qr','matricula_id'),
    JSON_ARRAY('fk_ingreso_usuario','registros_ingreso','registrado_por',1,'usuarios','id'),
    JSON_ARRAY('fk_qr_matricula','credenciales_qr','matricula_id',1,'matriculas','id'),
    JSON_ARRAY('fk_qr_emisor','credenciales_qr','emitido_por',1,'usuarios','id'),
    JSON_ARRAY('fk_bitacora_usuario','bitacora_actividades','usuario_id',1,'usuarios','id'),
    JSON_ARRAY('fk_config_usuario','configuracion_sistema','updated_by',1,'usuarios','id')
  );
  IF EXISTS (SELECT 1 FROM JSON_TABLE(relaciones, '$[*]' COLUMNS (
      nombre VARCHAR(64) PATH '$[0]', tabla VARCHAR(64) PATH '$[1]',
      columna VARCHAR(64) PATH '$[2]', posicion INT PATH '$[3]',
      destino VARCHAR(64) PATH '$[4]', campo VARCHAR(64) PATH '$[5]')) e
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
        AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
      WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_SCHEMA = DATABASE()
        AND k.CONSTRAINT_NAME = e.nombre AND k.TABLE_NAME = e.tabla AND k.COLUMN_NAME = e.columna
        AND k.ORDINAL_POSITION = e.posicion AND k.REFERENCED_TABLE_NAME = e.destino
        AND k.REFERENCED_COLUMN_NAME = e.campo AND r.DELETE_RULE = 'RESTRICT'
        AND r.UPDATE_RULE IN ('RESTRICT','NO ACTION'))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: claves foraneas esperadas ausentes o distintas.';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k
      WHERE k.REFERENCED_TABLE_NAME IS NOT NULL AND (
        (k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME IN
          ('registros_ingreso','credenciales_qr','bitacora_actividades','configuracion_sistema'))
        OR (k.REFERENCED_TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IN
          ('registros_ingreso','credenciales_qr','bitacora_actividades','configuracion_sistema'))
        OR (k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'usuarios'
          AND k.COLUMN_NAME IN ('puede_escanear_qr','puede_usar_bitacora'))
        OR (k.REFERENCED_TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'usuarios'
          AND k.REFERENCED_COLUMN_NAME IN ('puede_escanear_qr','puede_usar_bitacora')))) <> 8 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: dependencias adicionales; requiere revision manual.';
  END IF;

  -- No admitir objetos de servidor adicionales con posibles usos indirectos.
  IF EXISTS (SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE())
    OR EXISTS (SELECT 1 FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE())
    OR EXISTS (SELECT 1 FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()
      AND ROUTINE_NAME <> '_migracion_009_retirar_legado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: triggers, eventos o rutinas adicionales; detenerse.';
  END IF;

  -- Comprobaciones de contenido ANTES del primer ALTER/DROP de datos institucionales.
  IF EXISTS (SELECT 1 FROM registros_ingreso LIMIT 1)
    OR EXISTS (SELECT 1 FROM credenciales_qr LIMIT 1)
    OR EXISTS (SELECT 1 FROM bitacora_actividades LIMIT 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: tablas obsoletas con datos; no se autoriza su perdida.';
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE puede_escanear_qr <> 0 OR puede_usar_bitacora <> 0 LIMIT 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: indicadores habilitados; requiere decision expresa.';
  END IF;
  IF (SELECT COUNT(*) FROM configuracion_sistema) <> 2
    OR (SELECT COUNT(*) FROM configuracion_sistema WHERE
      BINARY clave = BINARY 'qr_habilitado' AND BINARY valor = BINARY 'false'
      AND BINARY descripcion = BINARY 'Habilita el modulo opcional de ingreso por QR' AND updated_by IS NULL) <> 1
    OR (SELECT COUNT(*) FROM configuracion_sistema WHERE
      BINARY clave = BINARY 'bitacora_habilitada' AND BINARY valor = BINARY 'false'
      AND BINARY descripcion = BINARY 'Habilita el modulo opcional de bitacora' AND updated_by IS NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '009: configuracion distinta de las dos semillas inactivas.';
  END IF;

  -- Unico bloque destructivo. No hay DML, CASCADE, IF EXISTS ni reintentos.
  ALTER TABLE usuarios DROP COLUMN puede_escanear_qr, DROP COLUMN puede_usar_bitacora;
  DROP TABLE registros_ingreso;
  DROP TABLE credenciales_qr;
  DROP TABLE bitacora_actividades;
  DROP TABLE configuracion_sistema;
END$$
DELIMITER ;

-- Solo si CREATE PROCEDURE termino correctamente y la ejecucion fue autorizada.
CALL asistencia_paillardelle._migracion_009_retirar_legado();
DROP PROCEDURE asistencia_paillardelle._migracion_009_retirar_legado;
