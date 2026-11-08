-- I.E. Enrique Paillardelle - Sistema web de control de asistencia
-- Esquema inicial v1.0 | MySQL 8.0.16+ (preferible 8.4 LTS)
-- Ejecutar en una base nueva. No contiene DROP ni datos personales.
-- Requiere permisos CREATE DATABASE/CREATE TABLE (o crear la BD manualmente).
-- IMPORTANTE: las reglas de autorización y solapamiento requieren lógica transaccional en Express.

CREATE DATABASE IF NOT EXISTS asistencia_paillardelle
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE asistencia_paillardelle;

CREATE TABLE anios_escolares (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  anio SMALLINT UNSIGNED NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado ENUM('PLANIFICADO','ABIERTO','CERRADO') NOT NULL DEFAULT 'PLANIFICADO',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_anios_anio UNIQUE (anio),
  CONSTRAINT chk_anios_fechas CHECK (fecha_inicio <= fecha_fin),
  CONSTRAINT chk_anios_rango CHECK (anio BETWEEN 2000 AND 2200)
) ENGINE=InnoDB;

CREATE TABLE estudiantes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo_estudiante VARCHAR(30) NULL,
  tipo_documento VARCHAR(15) NULL,
  numero_documento VARCHAR(20) NULL,
  apellido_paterno VARCHAR(80) NOT NULL,
  apellido_materno VARCHAR(80) NULL,
  nombres VARCHAR(120) NOT NULL,
  fecha_nacimiento DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_estudiantes_codigo UNIQUE (codigo_estudiante),
  CONSTRAINT uq_estudiantes_documento UNIQUE (tipo_documento, numero_documento),
  CONSTRAINT chk_estudiantes_documento CHECK (
    (tipo_documento IS NULL AND numero_documento IS NULL)
    OR (tipo_documento IS NOT NULL AND numero_documento IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE secciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  anio_escolar_id BIGINT UNSIGNED NOT NULL,
  nivel ENUM('PRIMARIA','SECUNDARIA') NOT NULL,
  grado TINYINT UNSIGNED NOT NULL,
  letra VARCHAR(5) NOT NULL,
  turno VARCHAR(20) NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_secciones UNIQUE (anio_escolar_id,nivel,grado,letra),
  CONSTRAINT uq_secciones_anio_id UNIQUE (anio_escolar_id,id),
  CONSTRAINT fk_secciones_anio FOREIGN KEY (anio_escolar_id) REFERENCES anios_escolares(id) ON DELETE RESTRICT,
  CONSTRAINT chk_secciones_grado CHECK (
    (nivel='PRIMARIA' AND grado BETWEEN 1 AND 6)
    OR (nivel='SECUNDARIA' AND grado BETWEEN 1 AND 5)
  )
) ENGINE=InnoDB;

CREATE TABLE matriculas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  estudiante_id BIGINT UNSIGNED NOT NULL,
  anio_escolar_id BIGINT UNSIGNED NOT NULL,
  fecha_ingreso DATE NOT NULL,
  fecha_retiro DATE NULL,
  estado ENUM('ACTIVA','RETIRADA','FINALIZADA') NOT NULL DEFAULT 'ACTIVA',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_matricula_estudiante_anio UNIQUE (estudiante_id,anio_escolar_id),
  CONSTRAINT uq_matricula_id_anio UNIQUE (id,anio_escolar_id),
  CONSTRAINT fk_matricula_estudiante FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_matricula_anio FOREIGN KEY (anio_escolar_id) REFERENCES anios_escolares(id) ON DELETE RESTRICT,
  CONSTRAINT chk_matricula_fechas CHECK (fecha_retiro IS NULL OR fecha_retiro >= fecha_ingreso)
) ENGINE=InnoDB;

CREATE TABLE matricula_secciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  matricula_id BIGINT UNSIGNED NOT NULL,
  anio_escolar_id BIGINT UNSIGNED NOT NULL,
  seccion_id BIGINT UNSIGNED NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ms_id_matricula UNIQUE (id,matricula_id),
  KEY ix_ms_matricula_fechas (matricula_id,fecha_inicio,fecha_fin),
  KEY ix_ms_seccion_fechas (seccion_id,fecha_inicio,fecha_fin),
  CONSTRAINT fk_ms_matricula_anio FOREIGN KEY (matricula_id,anio_escolar_id)
    REFERENCES matriculas(id,anio_escolar_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ms_seccion_anio FOREIGN KEY (anio_escolar_id,seccion_id)
    REFERENCES secciones(anio_escolar_id,id) ON DELETE RESTRICT,
  CONSTRAINT chk_ms_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
) ENGINE=InnoDB;

CREATE TABLE contactos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo_documento VARCHAR(15) NULL,
  numero_documento VARCHAR(20) NULL,
  nombres_apellidos VARCHAR(180) NOT NULL,
  telefono VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_contactos_documento UNIQUE (tipo_documento,numero_documento),
  CONSTRAINT chk_contactos_documento CHECK (
    (tipo_documento IS NULL AND numero_documento IS NULL)
    OR (tipo_documento IS NOT NULL AND numero_documento IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE estudiante_contactos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  estudiante_id BIGINT UNSIGNED NOT NULL,
  contacto_id BIGINT UNSIGNED NOT NULL,
  parentesco VARCHAR(30) NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  -- MySQL permite multiples NULL en UNIQUE: solo un vinculo ACTIVO por estudiante.
  estudiante_activo_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN activo = TRUE THEN estudiante_id ELSE NULL END
  ) STORED,
  CONSTRAINT uq_ec_estudiante_contacto UNIQUE (estudiante_id,contacto_id),
  CONSTRAINT uq_ec_un_activo UNIQUE (estudiante_activo_id),
  KEY ix_ec_contacto (contacto_id),
  CONSTRAINT fk_ec_estudiante FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ec_contacto FOREIGN KEY (contacto_id) REFERENCES contactos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombres VARCHAR(100) NOT NULL,
  apellidos VARCHAR(120) NOT NULL,
  usuario VARCHAR(60) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('ADMIN','SUBDIRECCION','REGISTRADOR') NOT NULL,
  cargo VARCHAR(30) NULL,
  nivel_asignado ENUM('PRIMARIA','SECUNDARIA') NULL,
  puede_escanear_qr BOOLEAN NOT NULL DEFAULT FALSE,
  puede_usar_bitacora BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_usuario UNIQUE (usuario),
  CONSTRAINT chk_usuario_nivel CHECK (rol <> 'SUBDIRECCION' OR nivel_asignado IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE asignaciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  seccion_id BIGINT UNSIGNED NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_asign_usuario_fechas (usuario_id,fecha_inicio,fecha_fin),
  KEY ix_asign_seccion_fechas (seccion_id,fecha_inicio,fecha_fin),
  CONSTRAINT fk_asign_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_asign_seccion FOREIGN KEY (seccion_id) REFERENCES secciones(id) ON DELETE RESTRICT,
  CONSTRAINT chk_asign_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
) ENGINE=InnoDB;

CREATE TABLE calendario_lectivo (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  anio_escolar_id BIGINT UNSIGNED NOT NULL,
  nivel ENUM('PRIMARIA','SECUNDARIA') NOT NULL,
  fecha DATE NOT NULL,
  es_lectivo BOOLEAN NOT NULL DEFAULT TRUE,
  descripcion VARCHAR(150) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_calendario_dia UNIQUE (anio_escolar_id,nivel,fecha),
  CONSTRAINT fk_calendario_anio FOREIGN KEY (anio_escolar_id) REFERENCES anios_escolares(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE asistencias (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  matricula_id BIGINT UNSIGNED NOT NULL,
  matricula_seccion_id BIGINT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  estado ENUM('PRESENTE','TARDANZA','FALTA') NOT NULL,
  justificada BOOLEAN NOT NULL DEFAULT FALSE,
  registrado_por BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_asistencia_matricula_fecha UNIQUE (matricula_id,fecha),
  KEY ix_asistencia_fecha_estado (fecha,estado,justificada),
  KEY ix_asistencia_seccion_fecha (matricula_seccion_id,fecha),
  KEY ix_asistencia_registrador (registrado_por),
  CONSTRAINT fk_asistencia_matricula FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_asistencia_ms_matricula FOREIGN KEY (matricula_seccion_id,matricula_id)
    REFERENCES matricula_secciones(id,matricula_id) ON DELETE RESTRICT,
  CONSTRAINT fk_asistencia_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT chk_asistencia_justificada CHECK (estado='FALTA' OR justificada=FALSE),
  CONSTRAINT chk_asistencia_version CHECK (version >= 1)
) ENGINE=InnoDB;

CREATE TABLE historial_asistencias (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asistencia_id BIGINT UNSIGNED NOT NULL,
  estado_anterior ENUM('PRESENTE','TARDANZA','FALTA') NOT NULL,
  estado_nuevo ENUM('PRESENTE','TARDANZA','FALTA') NOT NULL,
  justificada_anterior BOOLEAN NOT NULL,
  justificada_nueva BOOLEAN NOT NULL,
  modificado_por BIGINT UNSIGNED NOT NULL,
  fecha_modificacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_hist_asistencia_fecha (asistencia_id,fecha_modificacion),
  KEY ix_hist_usuario (modificado_por),
  CONSTRAINT fk_hist_asistencia FOREIGN KEY (asistencia_id) REFERENCES asistencias(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hist_usuario FOREIGN KEY (modificado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT chk_hist_cambio CHECK (
    estado_anterior <> estado_nuevo OR justificada_anterior <> justificada_nueva
  ),
  CONSTRAINT chk_hist_antes CHECK (estado_anterior='FALTA' OR justificada_anterior=FALSE),
  CONSTRAINT chk_hist_despues CHECK (estado_nuevo='FALTA' OR justificada_nueva=FALSE)
) ENGINE=InnoDB;

CREATE TABLE auditoria_administrativa (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  accion VARCHAR(50) NOT NULL,
  entidad VARCHAR(60) NOT NULL,
  registro_id BIGINT UNSIGNED NULL,
  datos_anteriores JSON NULL,
  datos_nuevos JSON NULL,
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion VARCHAR(255) NULL,
  KEY ix_auditoria_entidad_registro (entidad,registro_id),
  KEY ix_auditoria_usuario_fecha (usuario_id,fecha_hora),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE configuracion_sistema (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(100) NOT NULL,
  valor VARCHAR(255) NOT NULL,
  descripcion VARCHAR(255) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_config_clave UNIQUE (clave),
  CONSTRAINT fk_config_usuario FOREIGN KEY (updated_by) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE credenciales_qr (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  matricula_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  estado ENUM('ACTIVA','REVOCADA') NOT NULL DEFAULT 'ACTIVA',
  fecha_emision DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_revocacion DATETIME NULL,
  emitido_por BIGINT UNSIGNED NOT NULL,
  -- Solo una credencial activa por matricula; las revocadas quedan historicas.
  matricula_qr_activa BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN estado='ACTIVA' THEN matricula_id ELSE NULL END
  ) STORED,
  CONSTRAINT uq_qr_token UNIQUE (token_hash),
  CONSTRAINT uq_qr_una_activa UNIQUE (matricula_qr_activa),
  CONSTRAINT uq_qr_id_matricula UNIQUE (id,matricula_id),
  KEY ix_qr_matricula (matricula_id),
  CONSTRAINT fk_qr_matricula FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_qr_emisor FOREIGN KEY (emitido_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT chk_qr_revocacion CHECK (
    (estado='ACTIVA' AND fecha_revocacion IS NULL)
    OR (estado='REVOCADA' AND fecha_revocacion IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE registros_ingreso (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  matricula_id BIGINT UNSIGNED NOT NULL,
  credencial_qr_id BIGINT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  hora_ingreso TIME NOT NULL,
  registrado_por BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ingreso_matricula_fecha UNIQUE (matricula_id,fecha),
  KEY ix_ingreso_fecha (fecha),
  KEY ix_ingreso_qr (credencial_qr_id),
  CONSTRAINT fk_ingreso_matricula FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ingreso_qr_matricula FOREIGN KEY (credencial_qr_id,matricula_id)
    REFERENCES credenciales_qr(id,matricula_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ingreso_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE bitacora_actividades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  nivel ENUM('PRIMARIA','SECUNDARIA') NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_bitacora_nivel_fecha (nivel,fecha),
  KEY ix_bitacora_usuario_fecha (usuario_id,fecha),
  CONSTRAINT fk_bitacora_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO configuracion_sistema (clave,valor,descripcion) VALUES
 ('qr_habilitado','false','Habilita el modulo opcional de ingreso por QR'),
 ('bitacora_habilitada','false','Habilita el modulo opcional de bitacora');

-- Comprobacion:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;

-- REGLAS PARA EL BACKEND (no garantizadas solo por este esquema):
-- 1. Verificar rol, nivel, seccion, asignacion vigente y anio ABIERTO en cada operacion.
-- 2. REGISTRADOR: correccion FALTA -> TARDANZA por llegada posterior verificada;
--    SUBDIRECCION: justificar/desjustificar FALTA tras tramite FUT externo.
-- 3. Validar dia lectivo, fechas de matricula, seccion y asignacion.
-- 4. Evitar solapamientos de matricula_secciones y asignaciones con transacciones
--    y bloqueos adecuados (incluidas solicitudes concurrentes).
-- 5. Guardar actualizacion de asistencia + historial en una transaccion, usando version.
-- 6. Guardar cambios administrativos + auditoria en una transaccion.
-- 7. Importar Excel con vista previa, validaciones y manejo de duplicados.
-- 8. Token QR aleatorio: almacenar SHA-256 en token_hash (hex de 64 caracteres);
--    nunca DNI ni codigo escolar. No guardar token sin hash en logs.
-- 9. Para reimpresion de QR no se puede recuperar el token a partir del hash:
--    reemitir y revocar el anterior, o imprimir solo al generar.
-- 10. Proteger datos personales, backups y acceso a la BD; usar usuario SQL
--     de privilegios minimos en la aplicacion.
-- 11. No permitir edicion ordinaria de anios cerrados. Procedimiento excepcional pendiente.
-- 12. Las FKs no comprueban por si solas que la fecha de asistencia corresponda
--     al periodo de seccion, ni que calendario y matricula tengan mismo anio.
-- 13. Los datos del contacto compartido afectan a todos sus estudiantes vinculados.
-- 14. Las auditorias deben excluir hashes de contrasenas y tokens QR.
