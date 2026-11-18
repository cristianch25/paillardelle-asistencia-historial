import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';

export type StatisticsQuery = {
  anio_escolar_id: string;
  fecha_desde: string;
  fecha_hasta: string;
  nivel?: EducationLevel;
};
export type AttendanceStatistics = {
  filtros: Omit<StatisticsQuery, 'nivel'> & { nivel: EducationLevel | null };
  niveles_autorizados: EducationLevel[];
  totales: { presentes: number; tardanzas: number; faltas: number; pendientes: number };
  marcas_registradas: number;
  sesiones_con_registro: number;
};
export type StatisticsPeriod = 'dia' | 'semana' | 'mes' | 'personalizado';
