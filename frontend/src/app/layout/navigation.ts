import { House, School, ClipboardList, Users, ChartColumn, CalendarDays, type LucideIcon } from 'lucide-react';
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
  { label: 'Inicio', path: '/inicio', icon: House, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
  { label: 'Usuarios', path: '/usuarios', icon: Users, roles: ['ADMIN'] },
  { label: 'Años escolares', path: '/anios-escolares', icon: CalendarDays, roles: ['ADMIN'] },
  { label: 'Estadísticas', path: '/estadisticas', icon: ChartColumn, roles: ['ADMIN', 'SUBDIRECCION'] },
  { label: 'Calendario escolar', path: '/calendario', icon: CalendarDays, roles: ['ADMIN', 'SUBDIRECCION'] },
  { label: 'Secciones', registradorLabel: 'Mis secciones', path: '/secciones', icon: School, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
  { label: 'Asistencias', path: '/asistencias', icon: ClipboardList, roles: ['REGISTRADOR'] },
  { label: 'Asistencias', path: '/asistencias/supervision', icon: ClipboardList, roles: ['ADMIN', 'SUBDIRECCION'] },
  { label: 'Ficha mensual PDF', path: '/reportes', icon: ClipboardList, roles: ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'] },
];

export function navigationFor(role: UserRole) {
  return navigation.filter(item => item.roles.includes(role))
    .map(item => ({ ...item, label: role === 'REGISTRADOR' ? item.registradorLabel ?? item.label : item.label }));
}
