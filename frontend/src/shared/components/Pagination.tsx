import Button from './Button';
import type { Pagination as PaginationData } from '../types/pagination';

type Props = { pagination: PaginationData; onPageChange: (page: number) => void };
export default function Pagination({ pagination, onPageChange }: Props) {
  return (
    <nav aria-label="Paginación de resultados" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
      <p className="text-sm text-slate-600">Página {pagination.page}</p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Anterior</Button>
        <Button variant="secondary" disabled={!pagination.has_more} onClick={() => onPageChange(pagination.page + 1)}>Siguiente</Button>
      </div>
    </nav>
  );
}
