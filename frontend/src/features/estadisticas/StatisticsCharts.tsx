import type { AttendanceStatistics } from './statistics.types';

export default function StatisticsCharts({ data }: { data: AttendanceStatistics }) {
  const rows = [
    { label: 'Presentes', value: data.totales.presentes, color: '#22C55E' },
    { label: 'Tardanzas', value: data.totales.tardanzas, color: '#F59E0B' },
    { label: 'Faltas', value: data.totales.faltas, color: '#F43F5E' },
  ];
  const maximum = Math.max(1, ...rows.map(row => row.value));
  let offset = 0;
  return <section aria-label="Resultados de estadísticas" className="space-y-4">
    <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div><dt className="text-sm text-slate-600">Marcas registradas</dt><dd className="text-2xl font-bold">{data.marcas_registradas}</dd></div>
      <div><dt className="text-sm text-slate-600">Pendientes</dt><dd className="text-2xl font-bold">{data.totales.pendientes}</dd></div>
    </dl>
    <div className="grid gap-4 lg:grid-cols-2">
      <figure className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <figcaption className="font-semibold">Cantidades de asistencia</figcaption>
        <svg role="img" aria-label="Gráfico de barras de asistencia" viewBox="0 0 420 180" className="mt-3 w-full">
          <title>{rows.map(row => `${row.label}: ${row.value}`).join(', ')}</title>
          {rows.map((row, index) => <g key={row.label}>
            <text x="0" y={34 + index * 55} fontSize="15" fill="#334155">{row.label}</text>
            <rect x="100" y={15 + index * 55} width={240 * row.value / maximum} height="28" rx="4" fill={row.color} />
            <text x="350" y={34 + index * 55} fontSize="15" fill="#0f172a">{row.value}</text>
          </g>)}
        </svg>
      </figure>
      <figure className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <figcaption className="font-semibold">Distribución de marcas registradas</figcaption>
        {data.marcas_registradas > 0 ? <>
          <svg role="img" aria-label="Gráfico circular de asistencia" viewBox="0 0 120 120" className="mx-auto my-3 h-40 w-40">
            <title>{`Porcentajes sobre ${data.marcas_registradas} marcas registradas`}</title>
            {rows.map(row => {
              const share = row.value / data.marcas_registradas * 100, start = offset; offset += share;
              return share > 0 ? <circle key={row.label} cx="60" cy="60" r="42" fill="none" stroke={row.color}
                strokeWidth="24" pathLength="100" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start}
                transform="rotate(-90 60 60)" /> : null;
            })}
          </svg>
          <ul className="space-y-1 text-sm">{rows.map(row => <li key={row.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: row.color }} />
            {row.label}: {row.value} ({(row.value / data.marcas_registradas * 100).toLocaleString('es-PE', { maximumFractionDigits: 1 })} %)
          </li>)}</ul>
        </> : <p className="py-8 text-sm text-slate-600">No hay marcas registradas para calcular porcentajes.</p>}
      </figure>
    </div>
  </section>;
}
