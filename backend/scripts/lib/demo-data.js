export const year = { anio: 2026, fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18' };
export const start = '2026-11-02';
export const end = '2026-12-18';
export const sections = [
  { key: 'ini', nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' },
  { key: 'pri', nivel: 'PRIMARIA', grado: 1, letra: 'A' },
  { key: 'sec', nivel: 'SECUNDARIA', grado: 1, letra: 'A' },
];
export const users = [
  { key: 'sub-pri', rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' },
  { key: 'sub-sec', rol: 'SUBDIRECCION', nivel_asignado: 'SECUNDARIA' },
  ...sections.map(section => ({ key: `reg-${section.key}`, rol: 'REGISTRADOR', nivel_asignado: section.nivel })),
].map(user => ({ ...user, usuario: `demo26-${user.key}`, nombres: 'Cuenta ficticia',
  apellidos: `Demostracion ${user.key}`, activo: true, puede_escanear_qr: false, puede_usar_bitacora: false }));

export function student(section, index) {
  return { codigo_estudiante: `DEMO26-${section.key.toUpperCase()}-${String(index).padStart(3, '0')}`,
    apellido_paterno: 'Ficticio', apellido_materno: `Demostracion ${section.key}`, nombres: `Estudiante ${index}` };
}

export const summary = { anio: year, secciones: sections, estudiantes: 15, matriculas: 15,
  vinculos: 15, usuarios_nuevos: 5, admin: 'Reutilizado sin modificaciones', asignaciones: 3,
  supervision_adicional: 'INICIAL para SUBDIRECCION PRIMARIA',
  periodos: { cantidad: 3, fecha_inicio: start, fecha_fin: end }, fecha_ingreso: start };
