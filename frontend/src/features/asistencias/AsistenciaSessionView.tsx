import Button from '../../shared/components/Button';
import { Search } from 'lucide-react';
import type { AttendanceDetail, AttendanceState } from './asistencias.types';
import { draftSummary, type AttendanceChanges } from './attendanceDraft';
import AttendanceStudentRow from './AttendanceStudentRow';
import FormField from '../../shared/components/FormField';
import { searchCorrectionStudents } from './supervision/correctionStudentSearch';
import { useState } from 'react';
import UnsavedChangesDialog from '../../shared/navigation/UnsavedChangesDialog';

type Props = {
  data: AttendanceDetail;
  changes?: AttendanceChanges;
  editable?: boolean;
  disabled?: boolean;
  updated?: string[];
  created?: boolean;
  onSelect?: (id: string, state: AttendanceState) => void;
  onMarkPending?: () => void;
  reasons?: Record<string, string>;
  justificationDisabled?: boolean;
  onJustify?: (id: string, reason: string | undefined) => void;
  query?: string;
  onSearch?: (query: string) => void;
  pendingCount?: number;
  compact?: boolean;
  administrativeDetail?: boolean;
};

export default function AsistenciaSessionView({ data, changes = {}, editable = false, disabled = false, updated = [], created = false, onSelect, onMarkPending,
  reasons = {}, justificationDisabled = disabled, onJustify, query = '', onSearch, pendingCount = 0, compact = false, administrativeDetail = false }: Props) {
  const canEdit = editable;
  const local = canEdit ? changes : {};
  const counts = Object.keys(local).length ? draftSummary(data.padron, local) : data.resumen;
  const visible = searchCorrectionStudents(data.padron, query);
  const detailed = administrativeDetail && !compact;
  const enhancedSearch = detailed || compact;
  const eligible = data.padron.filter(row => !row.justificada && (local[row.asistencia_id] ?? row.estado) === 'PENDIENTE').length;
  const [bulkRequest, setBulkRequest] = useState<{ data: AttendanceDetail; changes: AttendanceChanges } | null>(null);
  if (bulkRequest && (bulkRequest.data !== data || bulkRequest.changes !== changes || disabled || !canEdit || !compact)) setBulkRequest(null);
  return (
    <section aria-label="Sesión de asistencia" className="space-y-3">
      {!compact && !detailed && <div role="status" className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="font-semibold">{canEdit ? 'Registro de asistencia' : created ? 'Asistencia iniciada'
          : !data.sesion.id ? 'Lista de estudiantes' : `Sesión ${data.sesion.estado === 'CERRADA' ? 'cerrada' : 'abierta'}`}{!canEdit && !onJustify && ' · Solo consulta'}</p>
      </div>}
      {canEdit && !compact && !detailed && <p className="text-xs text-slate-600">Las marcas se guardan solo al pulsar «Guardar cambios». Si sales con cambios sin guardar, se perderán.</p>}
      <div className={enhancedSearch ? 'relative w-full max-w-2xl [&_label]:text-base [&_label]:font-bold [&_input]:rounded-full [&_input]:border-institutional-700 [&_input]:pl-11 [&_input]:shadow-sm' : 'max-w-lg'}>
        {enhancedSearch && <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-11 size-5 text-institutional-700" />}
        <FormField label="Buscar estudiante" type="search" value={query} onChange={event => onSearch?.(event.target.value)}
          placeholder="Nombres, apellidos o código" />
        <p role="status" className="mt-2 text-xs text-slate-600">Mostrando {visible.length} de {data.padron.length} estudiantes{!compact && ` · ${pendingCount} ${pendingCount === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}`}</p>
      </div>
      {canEdit && <div className={compact ? 'space-y-1 [&_button]:rounded-full' : 'space-y-1'}>
        <Button variant={compact ? 'primary' : 'secondary'} className="w-full sm:w-auto" disabled={disabled || !counts.pendientes}
          onClick={compact ? () => { if (eligible) setBulkRequest({ data, changes }); } : onMarkPending}>
          Marcar todos como presentes
        </Button>
        {!compact && !detailed && <p className="text-xs text-slate-600">Se aplica a los estudiantes sin marcar elegibles de toda la sección, incluidos los ocultos por la búsqueda, previa confirmación.
          {!counts.pendientes && ' No hay estudiantes sin marcar.'}</p>}
      </div>}
      {bulkRequest && <UnsavedChangesDialog open busy={disabled} dirty={false}
        confirmation={{ title: 'Marcar todos como presentes',
          message: `Se marcarán como presentes ${eligible} estudiantes que aún están sin marcar` }}
        onCancel={() => setBulkRequest(null)} onConfirm={() => {
          setBulkRequest(null);
          if (!disabled && canEdit && eligible && bulkRequest.data === data && bulkRequest.changes === changes) onMarkPending?.();
        }} />}
      <ul aria-label="Estudiantes y marcas actuales" className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {visible.map(row => <AttendanceStudentRow key={row.asistencia_id} row={row} padron={data.padron}
          compact={compact} profileContext={compact ? undefined : { yearId: data.sesion.anio_escolar_id, month: data.sesion.fecha.slice(0, 7) }}
          state={local[row.asistencia_id] ?? row.estado} changed={local[row.asistencia_id] !== undefined || reasons[row.asistencia_id] !== undefined}
          editable={canEdit} disabled={disabled} updated={updated.includes(row.asistencia_id)} onSelect={onSelect}
          reason={reasons[row.asistencia_id]} onJustify={onJustify} justificationDisabled={justificationDisabled} />)}
      </ul>
      {!visible.length && <p role="status" className="text-sm text-slate-600">No hay estudiantes que coincidan con la búsqueda. Los cambios pendientes se conservan.</p>}
    </section>
  );
}
