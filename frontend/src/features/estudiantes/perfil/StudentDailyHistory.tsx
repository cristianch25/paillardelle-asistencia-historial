import type { ProfileSection, StudentProfile } from './profile.types';
import { formatCivilDate, peruToday } from '../../../shared/dates/civilDate';

const labels = { PRESENTE: 'Presente', TARDANZA: 'Tardanza', FALTA: 'Falta', PENDIENTE: 'Pendiente',
  SIN_SESION: 'Sin sesión', SIN_ASISTENCIA: 'Sin marca individual', FUERA_DE_VIGENCIA: 'Fuera de vigencia o sin contexto autorizado' };
type Days = StudentProfile['dias'];

export default function StudentDailyHistory({ days, formatSection, today = peruToday() }: {
  days: Days; formatSection: (section: ProfileSection) => string; today?: string;
}) {
  const sorted = [...days].sort((left, right) => right.fecha.localeCompare(left.fecha));
  const elapsed = sorted.filter(day => day.fecha <= today), future = sorted.filter(day => day.fecha > today);
  const showSection = new Set(days.flatMap(day => day.seccion ? [day.seccion.id] : [])).size > 1;
  function table(rows: Days, caption: string) {
    return <div className="max-w-full overflow-x-auto"><table className={`w-full text-left text-sm ${showSection ? 'min-w-[32rem]' : 'min-w-[22rem]'}`}>
      <caption className="py-2 text-left font-semibold">{caption}</caption>
      <thead><tr>{['Fecha', ...(showSection ? ['Sección'] : []), 'Estado', 'Justificación'].map(label =>
        <th key={label} className="p-2" scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(day => <tr key={day.fecha} className="border-t border-slate-200 align-top">
        <th scope="row" className="p-2 font-normal">{formatCivilDate(day.fecha)}</th>
        {showSection && <td className="p-2">{day.seccion ? formatSection(day.seccion) : '—'}</td>}
        <td className="p-2">{day.estado ? labels[day.estado] : labels[day.situacion as Exclude<typeof day.situacion, 'CON_REGISTRO'>]}
          {day.es_lectivo === false && <span className="block text-xs text-slate-600">Día no lectivo</span>}</td>
        <td className="max-w-xs break-words p-2">{day.justificada ? day.motivo_justificacion || 'Justificada' : '—'}</td>
      </tr>)}</tbody>
    </table></div>;
  }
  return <section aria-label="Historial diario" className="min-w-0 space-y-3">
    {table(elapsed, 'Historial diario del mes')}
    {!elapsed.length && <p className="text-sm text-slate-600">No hay fechas hasta hoy en el mes seleccionado.</p>}
    {future.length > 0 && <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-institutional-700">
        Fechas posteriores a hoy ({future.length})
      </summary>
      {table(future, 'Fechas posteriores a hoy')}
    </details>}
  </section>;
}
