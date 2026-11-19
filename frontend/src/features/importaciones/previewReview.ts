import type { PreviewRow } from './import.types';

export const academicConflict = (row: PreviewRow) => ['OBSERVADO', 'CONFLICTIVO', 'REQUIERE_ADMIN'].includes(row.clasificacion)
  || row.observaciones.some(item => item.ambito !== 'apoderado' && item.bloqueante);

export function previewReview(row: PreviewRow) {
  if (academicConflict(row)) {
    return { tone: 'blocked', label: 'Revisión requerida', className: 'bg-rose-50 text-slate-900', badge: 'text-rose-900' } as const;
  }
  if (row.ya_matriculado) {
    return { tone: 'unchanged', label: 'Ya matriculado', className: 'bg-slate-50 text-slate-900', badge: 'text-slate-700' } as const;
  }
  if (row.observaciones.length) {
    return { tone: 'warning', label: row.seleccionable ? 'Listo con observaciones' : 'Observaciones sin operación habilitada',
      className: 'bg-amber-50 text-slate-900', badge: 'text-amber-900' } as const;
  }
  if (row.seleccionable && row.propuestas.length) {
    return { tone: 'ready', label: 'Listo para la propuesta', className: 'bg-emerald-50 text-slate-900', badge: 'text-emerald-900' } as const;
  }
  return { tone: 'unchanged', label: 'Sin cambios propuestos', className: 'bg-slate-50 text-slate-900', badge: 'text-slate-700' } as const;
}
