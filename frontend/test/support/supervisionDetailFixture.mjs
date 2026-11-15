export const sessionId = '9007199254741995';
export const sectionId = '9007199254740995';
export function supervisionDetail(id = sessionId, estado = 'ABIERTA') {
  return { sesion: { id, seccion_id: id === sessionId ? sectionId : '9007199254740996',
    anio_escolar_id: '9007199254740993', fecha: '2026-11-15', estado, version: 3,
    abierta_por: '9007199254742995', abierta_en: '2026-11-15T12:00:00.000Z',
    cerrada_por: estado === 'CERRADA' ? '9007199254742995' : null, cerrada_en: estado === 'CERRADA' ? '2026-11-15T13:00:00.000Z' : null },
  padron: ['PRESENTE', 'TARDANZA', 'FALTA', 'PENDIENTE', 'PRESENTE'].map((estado, index) => ({
    asistencia_id: String(9007199254743995n + BigInt(index)), matricula_id: String(9007199254744995n + BigInt(index)),
    matricula_seccion_id: String(9007199254745995n + BigInt(index)), estado, version: estado === 'PENDIENTE' ? 0 : 1,
    estudiante: { id: String(9007199254746995n + BigInt(index)), codigo_estudiante: null, apellido_paterno: 'ApellidoExtensoParaVerificarAjusteEnPantallasPequeñas',
      apellido_materno: null, nombres: `Estudiante ${index + 1}` },
    ultimo_cambio: null,
  })), resumen: { total: 5, presentes: 2, tardanzas: 1, faltas: 1, pendientes: 1 } };
}
