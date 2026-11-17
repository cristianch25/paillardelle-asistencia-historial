export const userId = '9007199254741001';
export const schoolYear = { id: '9007199254741010', anio: 2026, estado: 'ABIERTO', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' };
export const schoolSections = [
  { id: '9007199254741020', anio_escolar_id: schoolYear.id, nivel: 'PRIMARIA', grado: 1, letra: 'A', turno: 'MAÑANA', activo: true },
  { id: '9007199254741021', anio_escolar_id: schoolYear.id, nivel: 'SECUNDARIA', grado: 1, letra: 'B', turno: null, activo: true },
  { id: '9007199254741022', anio_escolar_id: schoolYear.id, nivel: 'PRIMARIA', grado: 2, letra: 'C', turno: null, activo: false },
  { id: '9007199254741023', anio_escolar_id: schoolYear.id, nivel: 'PRIMARIA', grado: 2, letra: 'D', turno: null, activo: true },
];
export function fixtureUser(patch = {}) {
  return { id: userId, nombres: 'María', apellidos: 'Pérez', usuario: 'maria.prueba', rol: 'REGISTRADOR', cargo: 'DOCENTE',
    nivel_asignado: 'PRIMARIA', activo: true, puede_escanear_qr: false, puede_usar_bitacora: false, ...patch };
}
export function usersFixture() {
  return {
    users: [fixtureUser({ id: '9007199254740993', nombres: 'Administración', apellidos: 'Prueba', usuario: 'admin.prueba', rol: 'ADMIN', cargo: null, nivel_asignado: null }),
      fixtureUser(), fixtureUser({ id: '9007199254741002', nombres: 'Luis', usuario: 'luis.prueba', cargo: 'AUXILIAR', nivel_asignado: null, activo: false }),
      fixtureUser({ id: '9007199254741003', nombres: 'Ana', usuario: 'ana.prueba', rol: 'SUBDIRECCION', cargo: null })],
    assignments: [{ id: '9007199254741030', usuario_id: userId, seccion_id: schoolSections[0].id, fecha_inicio: '2026-03-01', fecha_fin: null,
      usuario: { nombres: 'María', apellidos: 'Pérez', cargo: 'DOCENTE' } }],
    sections: schoolSections,
    years: [schoolYear, { ...schoolYear, id: '9007199254741011', anio: 2025, estado: 'CERRADO', fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31' }],
  };
}
