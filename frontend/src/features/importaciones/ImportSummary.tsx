import type { ImportPreview, ImportReceipt } from './import.types';

function importSummary(data: ImportPreview, result: ImportReceipt | null = null) {
  const plan = data.resumen_confirmacion;
  const nuevos = result?.cantidades.estudiantes ?? plan?.estudiantes ?? data.resumen.NUEVO ?? 0;
  return {
    nuevos,
    registrados: result ? result.filas.length - nuevos : plan ? data.filas_seleccionadas.length - nuevos
      : data.resumen.existentes ?? (data.resumen.EXISTENTE ?? 0) + (data.resumen.EXISTENTE_CON_PROPUESTA ?? 0),
    pendientes: result?.cantidades.pendientes ?? plan?.pendientes ?? data.resumen.pendientes ?? 0,
    contactos: result?.cantidades.contactos_pendientes ?? plan?.contactos_pendientes ?? 0,
  };
}

export default function ImportSummary({ data, result = null }: { data: ImportPreview; result?: ImportReceipt | null }) {
  const counts = importSummary(data, result);
  return <div aria-label="Resumen de importación" className="space-y-3">
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[
      ['Estudiantes nuevos', counts.nuevos], ['Ya registrados', counts.registrados], ['Pendientes', counts.pendientes],
    ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-sm text-slate-600">{label}</dt><dd className="text-xl font-bold">{value}</dd>
    </div>)}</dl>
    {counts.contactos > 0 && <p className="text-sm">{counts.contactos} contactos necesitan revisión</p>}
  </div>;
}
