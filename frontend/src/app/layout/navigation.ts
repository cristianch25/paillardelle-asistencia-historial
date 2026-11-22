import { House, School, ClipboardList, Users, ChartColumn, CalendarDays, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { UserRole } from '../../features/auth/auth.types';

type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
  registradorLabel?: string;
};

export { roleLabels } from '../../features/auth/userPresentation';

const navigation: readonly NavigationItem[] = [
  { label: 'Administradores', path: '/administradores', icon: Users, roles: ['SUPERUSUARIO'] },
  { label: 'Seguridad', path: '/seguridad', icon: ShieldCheck, roles: ['SUPERUSUARIO'] },
  { label: 'Inicio', path: '/inicio', icon: House, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
  { label: 'Usuarios', path: '/usuarios', icon: Users, roles: ['ADMIN'] },
  { label: 'Asignaciones docentes', path: '/asignaciones-docentes', icon: Users, roles: ['SUBDIRECCION'] },
  { label: 'Historial de actividades', path: '/auditoria', icon: ShieldCheck, roles: ['ADMIN'] },
  { label: 'Años escolares', path: '/anios-escolares', icon: CalendarDays, roles: ['ADMIN'] },
  { label: 'Estadísticas', path: '/estadisticas', icon: ChartColumn, roles: ['ADMIN', 'SUBDIRECCION'] },
  { label: 'Calendario escolar', path: '/calendario', icon: CalendarDays, roles: ['ADMIN', 'SUBDIRECCION'] },
  { label: 'Secciones', registradorLabel: 'Mis secciones', path: '/secciones', icon: School, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
  { label: 'Asistencias', path: '/asistencias/supervision', icon: ClipboardList, roles: ['ADMIN', 'SUBDIRECCION'] },
  { label: 'Ficha mensual PDF', path: '/reportes', icon: ClipboardList, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
];

export function navigationFor(role: UserRole) {
  return navigation.filter(item => item.roles.includes(role))
    .map(item => ({ ...item, label: role === 'REGISTRADOR' ? item.registradorLabel ?? item.label : item.label }));
}
