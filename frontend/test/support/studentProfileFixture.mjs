export function studentProfileResponse(id = '1', yearId = '1', month = '2026-11') {
  const section = { id: '2', nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' };
  const [yyyy, mm] = month.split('-').map(Number), last = new Date(Date.UTC(yyyy, mm, 0)).getUTCDate();
  return {
    estudiante: { id, nombres: 'Ana María', apellido_paterno: 'Pérez', apellido_materno: null, codigo_estudiante: '00001' },
    contexto: { anio_escolar_id: yearId, mes: month, fecha_desde: `${month}-01`, fecha_hasta: `${month}-${last}`,
      seccion_actual: section, secciones: [{ ...section, fecha_inicio: `${month}-02`, fecha_fin: null }] },
    apoderado_visible: true, apoderado: { nombres_apellidos: 'Apoderada actual', telefono: '900000001' },
    resumen: { total: 4, presentes: 1, tardanzas: 1, faltas: 1, pendientes: 1, justificadas: 1,
      injustificadas: 1, faltas_justificadas: 1, tardanzas_justificadas: 0 },
    dias: Array.from({ length: last }, (_, index) => {
      const estado = [null, 'PRESENTE', 'FALTA', 'PENDIENTE', 'TARDANZA'][index] ?? null;
      return { fecha: `${month}-${String(index + 1).padStart(2, '0')}`, seccion: index === 0 ? null : section,
        estado, es_lectivo: index === 0 ? null : index !== 6, situacion: estado ? 'CON_REGISTRO' : index === 0 ? 'FUERA_DE_VIGENCIA' : index === 5 ? 'SIN_ASISTENCIA' : 'SIN_SESION',
        justificada: index === 2, motivo_justificacion: index === 2 ? 'Aviso vigente' : null };
    }),
  };
}
