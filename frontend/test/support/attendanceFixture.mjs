export const selection = {
  section: { id: '2', anio_escolar_id: '1', nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS', activo: true, turno: null },
  year: { id: '1', anio: 2026, estado: 'ABIERTO', fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18' },
};
export const data = {
  sesion: { id: '9007199254740993', anio_escolar_id: '1', seccion_id: '2', fecha: '2026-11-13', estado: 'ABIERTA', version: 7,
    abierta_por: '5', abierta_en: '2026-11-13 12:00:00', cerrada_por: null, cerrada_en: null },
  padron: ['PENDIENTE', 'PRESENTE', 'TARDANZA', 'FALTA'].map((estado, index) => ({ asistencia_id: String(9007199254740994n + BigInt(index)),
    matricula_id: String(10 + index), matricula_seccion_id: String(20 + index), version: index,
    estado, ultimo_cambio: null, estudiante: { id: String(index + 1), apellido_paterno: `Pérez ${index}`,
      apellido_materno: 'Del Río', nombres: 'Ana María', codigo_estudiante: null } })),
  resumen: { total: 4, presentes: 1, tardanzas: 1, faltas: 1, pendientes: 1 },
};
