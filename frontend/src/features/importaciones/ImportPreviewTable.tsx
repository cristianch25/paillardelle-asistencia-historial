import type { ImportPreview } from './import.types';
import { classificationLabels, observationLabel, operationLabel } from './importPresentation';
import Pagination from '../../shared/components/Pagination';
import { CircleCheck, TriangleAlert, CircleX, Minus } from 'lucide-react';
import { previewReview } from './previewReview';
import PreviewPhoneEditor from './PreviewPhoneEditor';

type Props = { data: ImportPreview; disabled: boolean; toggle: (id: string, value: boolean) => void; page: (value: number) => void;
  correctPhone: (id: string, phone: string | null, version: number) => Promise<boolean> };
export default function ImportPreviewTable({ data, disabled, toggle, page, correctPhone }: Props) {
  return <section aria-label="Vista previa del padrón" className="min-w-0 space-y-4">
    <p className="text-sm" role="status">{data.resumen.total} estudiantes · {data.filas_seleccionadas.length} filas seleccionadas para revisión.</p>
    <p className="text-xs text-slate-600">Las propuestas válidas se preseleccionan. Puedes desmarcarlas; esta selección no guarda datos ni confirma la importación.</p>
    <p className="text-xs text-slate-600">Los datos de apoderado observados requieren revisión; no impiden por sí solos proponer el alta del estudiante.</p>
    <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm"><caption className="sr-only">Clasificación y observaciones de estudiantes</caption>
        <thead><tr>{['Seleccionar', 'Estudiante', 'Sección y estado de origen', 'Clasificación', 'Observaciones'].map(label =>
          <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead>
        <tbody>{data.registros.map(row => {
          const review = previewReview(row);
          const Icon = { ready: CircleCheck, warning: TriangleAlert, blocked: CircleX, unchanged: Minus }[review.tone];
          return <tr key={row.id} data-review={review.tone} className={`border-t border-slate-200 align-top ${review.className}`}>
          <td className="p-3"><label className="flex min-h-11 min-w-11 items-center justify-center">
            <span className="sr-only">Seleccionar {row.estudiante.nombres}</span><input type="checkbox" className="size-5"
              disabled={disabled || !row.seleccionable} checked={data.filas_seleccionadas.includes(row.id)}
              onChange={e => toggle(row.id, e.target.checked)} /></label></td>
          <th scope="row" className="max-w-56 break-words p-3 font-medium">{[row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ')}
            <p className="break-all text-xs text-slate-600">{row.estudiante.codigo_estudiante || 'Sin código'}</p>
            {row.apoderado?.nombres_apellidos && <div className="mt-2 break-words text-xs font-normal text-slate-600">
              <p>Apoderado del archivo: {row.apoderado.nombres_apellidos}</p>
              <p>{[row.apoderado.tipo_documento, row.apoderado.numero_documento, row.apoderado.parentesco].filter(Boolean).join(' · ')}</p>
            </div>}
            {row.documento_omitido && <p className="mt-1 break-all text-xs text-amber-900">Documento de origen, sin proponer:
              {' '}{row.documento_original?.tipo || 'Sin tipo'} · {row.documento_original?.numero || 'Sin número'}</p>}</th>
          <td className="p-3">{row.contexto.grado_edad} · {row.contexto.seccion}<p className="text-xs">{row.estado_original}</p></td>
          <td className="p-3"><span className={`flex items-center gap-2 font-semibold ${review.badge}`}>
            <Icon aria-hidden="true" className="size-4 shrink-0" />{review.label}</span>
            {operationLabel(row) && <p className="mt-1 text-sm">{operationLabel(row)}</p>}
            {!row.ya_matriculado && <span className="text-xs">{classificationLabels[row.clasificacion] ?? 'Revisión'}</span>}</td>
          <td className="max-w-80 p-3"><ul className="space-y-1">{row.observaciones.filter(item => item.ambito !== 'apoderado').map((item, i) =>
            <li key={i}>{observationLabel(item.motivo)}</li>)}
            {row.observaciones.some(item => item.ambito === 'apoderado') && <li>Contacto por revisar</li>}</ul>
            {!row.observaciones.length && 'Sin observaciones.'}
            <PreviewPhoneEditor row={row} disabled={disabled} save={(phone, version) => correctPhone(row.id, phone, version)} /></td>
        </tr>; })}</tbody>
      </table>
    </div>
    {!disabled && <Pagination pagination={data.pagination} onPageChange={page} />}
  </section>;
}
