import { getPool } from '../../config/database.js';
import { activityFeedQuery } from './activity-feed.query.js';

export function createAdministrativeAuditRepository(poolProvider = getPool) {
  return {
    async append(connection, actorId, action, entity, before, after) {
      await connection.execute(`INSERT INTO auditoria_administrativa
        (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, action, entity, after?.id ?? null, before ? JSON.stringify(before) : null, JSON.stringify(after)]);
    },
    async list({ limit, offset, categoria }, connection = poolProvider()) {
      const feed = activityFeedQuery({ limit, offset, categoria });
      const [rows] = await connection.execute(
        `SELECT
          feed.id, feed.origen,
          COALESCE(a.usuario_id, h.modificado_por) AS usuario_id,
          CASE WHEN feed.origen = 'asistencia' THEN 'CAMBIO_ASISTENCIA' ELSE a.accion END AS accion,
          CASE WHEN feed.origen = 'asistencia' THEN 'asistencias' ELSE a.entidad END AS entidad,
          COALESCE(a.registro_id, h.asistencia_id) AS registro_id,
          feed.fecha_orden AS fecha_hora,
          a.descripcion,
          a.datos_anteriores->>'$.nivel' AS cal_nivel_antes, a.datos_nuevos->>'$.nivel' AS cal_nivel_despues,
          a.datos_anteriores->>'$.fecha' AS cal_fecha_antes, a.datos_nuevos->>'$.fecha' AS cal_fecha_despues,
          a.datos_anteriores->>'$.es_lectivo' AS cal_lectivo_antes, a.datos_nuevos->>'$.es_lectivo' AS cal_lectivo_despues,
          a.datos_anteriores->>'$.descripcion' AS cal_descripcion_antes, a.datos_nuevos->>'$.descripcion' AS cal_descripcion_despues,
          a.datos_anteriores->>'$.fecha_inicio' AS cal_inicio_antes, a.datos_nuevos->>'$.fecha_inicio' AS cal_inicio_despues,
          a.datos_anteriores->>'$.fecha_fin' AS cal_fin_antes, a.datos_nuevos->>'$.fecha_fin' AS cal_fin_despues,
          u_actor.nombres AS actor_nombres,
          u_actor.apellidos AS actor_apellidos,
          u_actor.usuario AS actor_usuario,
          u_actor.rol AS actor_rol,
          e.nombres AS estudiante_nombres,
          e.apellido_paterno AS estudiante_apellido_paterno,
          e.apellido_materno AS estudiante_apellido_materno,
          mark.fecha AS asistencia_fecha, mark.seccion_id AS asistencia_seccion_id,
          mark_student.id AS asistencia_estudiante_id,
          mark_student.nombres AS asistencia_nombres, mark_student.apellido_paterno AS asistencia_paterno,
          mark_student.apellido_materno AS asistencia_materno,
          mark_section.nivel AS asistencia_nivel, mark_section.grado AS asistencia_grado,
          mark_section.letra AS asistencia_letra,
          h.tipo, h.estado_anterior, h.estado_nuevo, h.justificada_anterior, h.justificada_nueva,
          h.motivo_justificacion_anterior, h.motivo_justificacion_nuevo, h.motivo,
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
        FROM ${feed.sql} feed
        LEFT JOIN auditoria_administrativa a ON feed.origen = 'administrativa' AND a.id = feed.id
        LEFT JOIN historial_asistencias h ON feed.origen = 'asistencia' AND h.id = feed.id
        LEFT JOIN asistencias mark ON mark.id = h.asistencia_id
        LEFT JOIN matriculas mark_enrollment ON mark_enrollment.id = mark.matricula_id
        LEFT JOIN estudiantes mark_student ON mark_student.id = mark_enrollment.estudiante_id
        LEFT JOIN secciones mark_section ON mark_section.id = mark.seccion_id
        LEFT JOIN usuarios u_actor ON COALESCE(a.usuario_id, h.modificado_por) = u_actor.id
        LEFT JOIN matriculas m ON a.entidad = 'matriculas' AND a.registro_id = m.id
        LEFT JOIN estudiantes e ON m.estudiante_id = e.id
        LEFT JOIN usuarios u_target ON a.entidad = 'usuarios' AND a.registro_id = u_target.id
        LEFT JOIN asignaciones asg ON a.entidad = 'asignaciones' AND a.registro_id = asg.id
        LEFT JOIN usuarios u_asg ON asg.usuario_id = u_asg.id
        LEFT JOIN secciones s_asg ON asg.seccion_id = s_asg.id
        LEFT JOIN secciones s_origen ON a.entidad = 'matriculas' AND s_origen.id = NULLIF(a.datos_anteriores->>'$.seccion_id', '')
        LEFT JOIN secciones s_destino ON a.entidad = 'matriculas' AND s_destino.id = NULLIF(a.datos_nuevos->>'$.seccion_id', '')
        LEFT JOIN matricula_secciones ms_ret ON ms_ret.id = (
          SELECT candidate.id FROM matricula_secciones candidate
          WHERE a.accion = 'RETIRAR_MATRICULA' AND a.entidad = 'matriculas'
          AND candidate.matricula_id = m.id AND candidate.fecha_fin = a.datos_nuevos->>'$.fecha_retiro'
          ORDER BY candidate.fecha_inicio DESC, candidate.id DESC LIMIT 1)
        LEFT JOIN secciones s_ret ON ms_ret.seccion_id = s_ret.id
        ORDER BY feed.fecha_orden DESC, feed.id DESC, feed.origen DESC`,
        feed.params,
      );
      return rows;
    },
  };
}
