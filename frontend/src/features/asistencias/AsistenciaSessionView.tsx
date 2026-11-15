import type { AttendanceOpening, AttendanceState } from './asistencias.types';

const stateLabels: Record<AttendanceState, string> = {
  PENDIENTE: 'Sin marcar', PRESENTE: 'Presente', TARDANZA: 'Tardanza', FALTA: 'Falta',
};

export default function AsistenciaSessionView({ data }: { data: AttendanceOpening }) {
  const counts = data.resumen;
  const summary = [['Total', counts.total], ['Presentes', counts.presentes], ['Tardanzas', counts.tardanzas],
    ['Faltas', counts.faltas], ['Sin marcar', counts.pendientes]] as const;
  return (
    <section aria-label="Sesión de asistencia" className="space-y-3">
      <div role="status" className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="font-semibold">Sesión {data.sesion.estado === 'ABIERTA' ? 'abierta' : 'cerrada'} · Solo consulta</p>
        <p className="text-slate-600">{data.creada ? 'Sesión creada.' : 'Sesión recuperada.'}</p>
      </div>
      <dl aria-label="Resumen de asistencia" className="grid grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-3 sm:gap-3 sm:p-4">
        {summary.map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="break-words text-xs text-slate-600">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd>
        </div>)}
      </dl>
      <ul aria-label="Estudiantes y marcas actuales" className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {data.padron.map(row => <li key={row.asistencia_id} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium">{[row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ')}</p>
            {row.estudiante.codigo_estudiante && <p className="mt-1 break-words text-sm text-slate-600">Código: {row.estudiante.codigo_estudiante}</p>}
          </div>
          <span className="rounded-lg bg-sky-soft px-3 py-2 text-sm font-semibold text-institutional-950">{stateLabels[row.estado]}</span>
        </li>)}
      </ul>
    </section>
  );
}
