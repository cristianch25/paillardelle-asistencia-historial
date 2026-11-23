import type { StudentProfile } from './profile.types';
import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import GuardianPhoneEditor from './GuardianPhoneEditor';
import StudentDailyHistory from './StudentDailyHistory';

const name = (section: NonNullable<StudentProfile['contexto']['seccion_actual']>) => `${educationLevelLabels[section.nivel]} · ${formatSectionName(section)}`;
export default function StudentProfileView({ data, compact = false, onBusyChange, onReload }: {
  data: StudentProfile; compact?: boolean; onBusyChange?: (busy: boolean) => void; onReload?: () => void;
}) {
  const phone = data.apoderado && data.apoderado_visible ? <GuardianPhoneEditor key={`${data.estudiante.id}:${data.apoderado.telefono}`}
    studentId={data.estudiante.id} phone={data.apoderado.telefono} onBusyChange={onBusyChange} onReload={onReload} /> : null;
  if (compact) return <div aria-label="Datos del perfil individual" className="min-w-0 space-y-4 break-words">
    <section className="space-y-2">
      <h3 className="text-lg font-bold">{[data.estudiante.apellido_paterno, data.estudiante.apellido_materno, data.estudiante.nombres].filter(Boolean).join(' ')}</h3>
      <p className="text-sm text-slate-600">{data.contexto.seccion_actual ? name(data.contexto.seccion_actual) : 'Sin sección actual'}</p>
    </section>
    <section className="space-y-2 border-t border-slate-200 pt-4">
      <h3 className="text-sm font-semibold text-slate-600">Apoderado</h3>
      {!data.apoderado_visible ? <p>Contacto no disponible.</p> : !data.apoderado ? <p>Sin apoderado vinculado.</p> : <>
        <p className="font-medium">{data.apoderado.nombres_apellidos}</p>
        {phone}
      </>}
    </section>
  </div>;
  return <div className="min-w-0 space-y-4" aria-label="Datos del perfil individual">
    <section className="space-y-1 break-words">
      <h3 className="text-lg font-bold">{[data.estudiante.apellido_paterno, data.estudiante.apellido_materno, data.estudiante.nombres].filter(Boolean).join(' ')}</h3>
      <p>Código: {data.estudiante.codigo_estudiante || 'No disponible'}</p>
    </section>
    <section className="rounded-lg bg-slate-50 p-3">
      <h3 className="font-semibold">Apoderado actual</h3>
      {!data.apoderado_visible ? <p className="text-sm">Sin permiso para consultar el apoderado actual.</p>
        : data.apoderado ? <><p className="break-words"><strong>{data.apoderado.nombres_apellidos}</strong></p>{phone}</>
          : <p className="text-sm">Sin apoderado vinculado actualmente.</p>}
    </section>
    <section><h3 className="font-semibold">Resumen mensual</h3>
      <dl className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-4">{(['presentes', 'tardanzas', 'faltas', 'pendientes'] as const).map(key =>
        <div key={key}><dt className="text-sm capitalize">{key}</dt><dd className="text-xl font-bold">{data.resumen[key]}</dd></div>)}</dl>
    </section>
    <StudentDailyHistory days={data.dias} formatSection={name} />
  </div>;
}
