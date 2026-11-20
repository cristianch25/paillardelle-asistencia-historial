import { getPool } from '../../config/database.js';

export function createAdministrativeAuditRepository(poolProvider = getPool) {
  return {
    async append(connection, actorId, action, entity, before, after) {
      await connection.execute(`INSERT INTO auditoria_administrativa
        (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, action, entity, after?.id ?? null, before ? JSON.stringify(before) : null, JSON.stringify(after)]);
    },
    async list({ limit, offset, accion }, connection = poolProvider()) {
      const conditions = [];
      const params = [];
      if (typeof accion === 'string' && accion.trim().length > 0) {
        const clean = accion.trim();
        if (clean === 'CAMBIO_SECCION' || clean === 'CAMBIAR_SECCION_MATRICULA') {
          conditions.push('(a.accion = "CAMBIO_SECCION" OR a.accion = "CAMBIAR_SECCION_MATRICULA")');
        } else if (clean === 'CREAR_ASIGNACION' || clean === 'ASIGNAR_DOCENTE') {
          conditions.push('(a.accion = "CREAR_ASIGNACION" OR a.accion = "ASIGNAR_DOCENTE")');
        } else if (clean === 'CREAR_MATRICULA' || clean === 'MATRICULAR_ESTUDIANTE') {
          conditions.push('(a.accion = "CREAR_MATRICULA" OR a.accion = "MATRICULAR_ESTUDIANTE")');
        } else {
          conditions.push('a.accion = ?');
          params.push(clean);
        }
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);
      const [rows] = await connection.execute(
        `SELECT
          a.id,
          a.usuario_id,
          a.accion,
          a.entidad,
          a.registro_id,
          a.fecha_hora,
          a.descripcion,
          u_actor.nombres AS actor_nombres,
          u_actor.apellidos AS actor_apellidos,
          u_actor.usuario AS actor_usuario,
          u_actor.rol AS actor_rol,
          e.nombres AS estudiante_nombres,
          e.apellido_paterno AS estudiante_apellido_paterno,
          e.apellido_materno AS estudiante_apellido_materno,
          u_target.nombres AS target_nombres,
          u_target.apellidos AS target_apellidos,
          u_target.usuario AS target_usuario,
          u_target.rol AS target_rol,
          u_asg.nombres AS asg_docente_nombres,
          u_asg.apellidos AS asg_docente_apellidos,
          u_asg.usuario AS asg_docente_usuario,
          s_asg.grado AS asg_seccion_grado,
          s_asg.letra AS asg_seccion_letra,
          s_asg.nivel AS asg_seccion_nivel,
          s_origen.grado AS origen_grado,
          s_origen.letra AS origen_letra,
          s_origen.nivel AS origen_nivel,
          s_destino.grado AS destino_grado,
          s_destino.letra AS destino_letra,
          s_destino.nivel AS destino_nivel,
          s_ret.grado AS retiro_grado,
          s_ret.letra AS retiro_letra,
          s_ret.nivel AS retiro_nivel
        FROM auditoria_administrativa a
        LEFT JOIN usuarios u_actor ON a.usuario_id = u_actor.id
        LEFT JOIN matriculas m ON a.entidad = 'matriculas' AND a.registro_id = m.id
        LEFT JOIN estudiantes e ON m.estudiante_id = e.id
        LEFT JOIN usuarios u_target ON a.entidad = 'usuarios' AND a.registro_id = u_target.id
        LEFT JOIN asignaciones asg ON a.entidad = 'asignaciones' AND a.registro_id = asg.id
        LEFT JOIN usuarios u_asg ON asg.usuario_id = u_asg.id
        LEFT JOIN secciones s_asg ON asg.seccion_id = s_asg.id
        LEFT JOIN secciones s_origen ON a.entidad = 'matriculas' AND s_origen.id = NULLIF(a.datos_anteriores->>'$.seccion_id', '')
        LEFT JOIN secciones s_destino ON a.entidad = 'matriculas' AND s_destino.id = NULLIF(a.datos_nuevos->>'$.seccion_id', '')
        LEFT JOIN matricula_secciones ms_ret ON a.accion = 'RETIRAR_MATRICULA' AND a.entidad = 'matriculas' AND ms_ret.matricula_id = m.id AND ms_ret.fecha_fin = a.datos_nuevos->>'$.fecha_retiro'
        LEFT JOIN secciones s_ret ON ms_ret.seccion_id = s_ret.id
        ${whereClause}
        ORDER BY a.fecha_hora DESC, a.id DESC
        LIMIT ? OFFSET ?`,
        params,
      );
      return rows;
    },
  };
}
