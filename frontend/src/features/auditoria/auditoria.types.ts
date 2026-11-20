import type { Pagination } from '../../shared/types/pagination';

export type AuditUser = {
  id: string;
  nombre_completo: string;
  usuario: string;
  rol: string;
};

export type AuditRecord = {
  id: string;
  fecha_hora: string;
  usuario: AuditUser;
  accion: string;
  accion_nombre: string;
  entidad: string;
  registro_id: string | null;
  descripcion: string;
};

export type AuditResponse = {
  registros: AuditRecord[];
  pagination: Pagination;
};

export type AuditQuery = {
  page?: number;
  limit?: number;
  accion?: string;
};
