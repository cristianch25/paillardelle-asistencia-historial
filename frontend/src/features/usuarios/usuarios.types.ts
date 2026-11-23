import type { AuthUser } from '../auth/auth.types';
import type { Section, EducationLevel } from '../organizacion-escolar/secciones/secciones.types';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import type { SectionAssignment } from '../organizacion-escolar/secciones/sectionStaff.api';

export type ManagedUser = AuthUser & { activo: boolean };
export type UserDraft = { nombres: string; apellidos: string; usuario: string; rol: string; cargo: string; nivel_asignado: EducationLevel | ''; password: string };
export type AssignmentInput = { usuario_id: string; seccion_id: string; fecha_inicio: string; fecha_fin: string | null };
export type AssignmentBatchInput = { usuario_id: string; anio_escolar_id: string; seccion_ids: string[]; fecha_inicio: string; fecha_fin: string | null };
export type UsersCatalog = { users: ManagedUser[]; assignments: SectionAssignment[]; sections: Section[]; years: SchoolYear[] };
export type AssignmentRegistrar = Pick<ManagedUser, 'id' | 'nombres' | 'apellidos' | 'rol' | 'cargo' | 'activo' | 'nivel_asignado'>;
export type AssignmentCatalog = Pick<UsersCatalog, 'assignments' | 'sections' | 'years'> & { registrars: AssignmentRegistrar[] };

export function initialUserDraft(user?: ManagedUser): UserDraft {
  return { nombres: user?.nombres ?? '', apellidos: user?.apellidos ?? '', usuario: user?.usuario ?? '',
    rol: user?.rol ?? 'REGISTRADOR', cargo: user ? user.cargo ?? '' : 'DOCENTE', nivel_asignado: user?.nivel_asignado ?? '', password: '' };
}

const wellFormed = (value: string) => !/[\uD800-\uDFFF]/u.test(value);
export function userRequest(draft: UserDraft, original?: ManagedUser) {
  const basic = { nombres: draft.nombres.trim(), apellidos: draft.apellidos.trim(), usuario: draft.usuario.trim() };
  for (const [field, max] of [['nombres', 100], ['apellidos', 120], ['usuario', 60]] as const) {
    if (!basic[field] || !wellFormed(basic[field]) || [...basic[field]].length > max) throw new Error(`Revisa ${field}: máximo ${max} caracteres.`);
  }
  // Una cuenta ADMIN existente solo admite aquí datos básicos, sin enviar su rol.
  if (original?.rol === 'ADMIN') return basic;
  if (!['REGISTRADOR', 'SUBDIRECCION'].includes(draft.rol)) throw new Error('Selecciona REGISTRADOR o SUBDIRECCION.');
  if (draft.rol === 'REGISTRADOR' && !['DOCENTE', 'AUXILIAR'].includes(draft.cargo)) throw new Error('Selecciona el cargo Docente o Auxiliar.');
  if (draft.rol === 'SUBDIRECCION' && !draft.nivel_asignado) throw new Error('Subdirección requiere un nivel principal.');
  if (draft.nivel_asignado && !['INICIAL', 'PRIMARIA', 'SECUNDARIA'].includes(draft.nivel_asignado)) throw new Error('Nivel no válido.');
  if (!wellFormed(draft.cargo) || [...draft.cargo].length > 30) throw new Error('El cargo admite hasta 30 caracteres.');
  const passwordBytes = new TextEncoder().encode(draft.password).length;
  if (!original && (!wellFormed(draft.password) || [...draft.password].length < 8 || passwordBytes > 72)) throw new Error('La contraseña inicial requiere al menos 8 caracteres y hasta 72 bytes UTF-8.');
  return { ...basic, rol: draft.rol, cargo: draft.cargo.trim() || null, nivel_asignado: draft.nivel_asignado || null,
    ...(!original ? { password: draft.password } : {}) };
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim();
export function matchesUser(user: ManagedUser, text: string) {
  const haystack = normalize(`${user.nombres} ${user.apellidos} ${user.usuario} ${user.id}`);
  return normalize(text).split(/\s+/).every(part => haystack.includes(part));
}
