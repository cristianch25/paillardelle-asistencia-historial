import type { AuthUser } from '../../auth/auth.types';
import type { EducationLevel } from '../../organizacion-escolar/secciones/secciones.types';

// Matriz específica de asistencia aprobada el 15/11/2026 en el contrato backend.
// Solo orienta la interfaz; cada GET vuelve a autorizar en servidor.
export function supervisionLevels(user: AuthUser): readonly EducationLevel[] {
  if (user.rol === 'ADMIN') return ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];
  if (user.rol !== 'SUBDIRECCION') return [];
  if (user.nivel_asignado === 'PRIMARIA') return ['INICIAL', 'PRIMARIA'];
  if (user.nivel_asignado === 'SECUNDARIA') return ['SECUNDARIA'];
  return user.nivel_asignado === 'INICIAL' ? ['INICIAL'] : [];
}
