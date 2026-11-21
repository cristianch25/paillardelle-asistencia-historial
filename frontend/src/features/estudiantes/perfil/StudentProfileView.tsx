import { useContext, useState } from 'react';
import type { StudentProfile } from './profile.types';
import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import { formatCivilDate } from '../../../shared/dates/civilDate';
import { AuthContext } from '../../auth/AuthContext';
import Button from '../../../shared/components/Button';
import GuardianPhoneEditor from './GuardianPhoneEditor';
import ReingresoDialog from '../../matriculas/ReingresoDialog';
import StudentDailyHistory from './StudentDailyHistory';

const name = (section: NonNullable<StudentProfile['contexto']['seccion_actual']>) => `${educationLevelLabels[section.nivel]} · ${formatSectionName(section)}`;
export default function StudentProfileView({ data, compact = false, onBusyChange, onReload }: {
  data: StudentProfile; compact?: boolean; onBusyChange?: (busy: boolean) => void; onReload?: () => void;
}) {
  const auth = useContext(AuthContext);
  const [showReingreso, setShowReingreso] = useState(false);
  const canReingresar = auth?.session?.user.rol === 'ADMIN' || auth?.session?.user.rol === 'SUBDIRECCION';
  const isRetired = data.contexto.matricula_estado === 'RETIRADA' && Boolean(data.contexto.matricula_id);
  const lastSection = data.contexto.secciones.at(-1);

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
      <p>Sección actual: {data.contexto.seccion_actual ? name(data.contexto.seccion_actual) : 'Sin sección vigente autorizada'}</p>
      <p className="text-sm">Secciones del período:</p>
      <ul className="text-sm">{data.contexto.secciones.map((section, index) => <li key={`${section.id}-${index}`}>
        {name(section)} · desde {formatCivilDate(section.fecha_inicio)}{section.fecha_fin ? ` hasta ${formatCivilDate(section.fecha_fin)}` : ''}</li>)}</ul>
    </section>
    {isRetired && lastSection && (
      <section className="rounded-lg bg-amber-50 p-4 border border-amber-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-900">Estudiante con matrícula RETIRADA</p>
          {data.contexto.fecha_retiro && (
            <p className="text-sm text-amber-700">Retirado el {formatCivilDate(data.contexto.fecha_retiro)}</p>
          )}
        </div>
        {canReingresar && (
          <Button variant="primary" onClick={() => setShowReingreso(true)}>
            Reingresar estudiante
          </Button>
        )}
      </section>
    )}
    <section className="rounded-lg bg-slate-50 p-3">
      <h3 className="font-semibold">Apoderado actual</h3>
      {!data.apoderado_visible ? <p className="text-sm">Sin permiso para consultar el apoderado actual.</p>
        : data.apoderado ? <><p className="break-words">{data.apoderado.nombres_apellidos}</p>{phone}</>
          : <p className="text-sm">Sin apoderado vinculado actualmente.</p>}
      <p className="text-xs text-slate-600">Vínculo activo actual; no representa el apoderado histórico del mes.</p>
    </section>
    <section><h3 className="font-semibold">Resumen mensual</h3>
      <dl className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-4">{(['presentes', 'tardanzas', 'faltas', 'pendientes'] as const).map(key =>
        <div key={key}><dt className="text-sm capitalize">{key}</dt><dd className="text-xl font-bold">{data.resumen[key]}</dd></div>)}</dl>
      <p className="text-sm">Incidencias justificadas: {data.resumen.justificadas} · No justificadas: {data.resumen.injustificadas}.</p>
      <p className="text-xs text-slate-600">Faltas justificadas: {data.resumen.faltas_justificadas} · Tardanzas justificadas: {data.resumen.tardanzas_justificadas}.</p>
      {!data.resumen.total && <p className="text-sm">No hay marcas individuales registradas en este mes y ámbito.</p>}
    </section>
    <StudentDailyHistory days={data.dias} formatSection={name} />
    {showReingreso && isRetired && lastSection && (
      <ReingresoDialog
        studentName={[data.estudiante.apellido_paterno, data.estudiante.apellido_materno, data.estudiante.nombres].filter(Boolean).join(' ')}
        matriculaId={data.contexto.matricula_id!}
        anioEscolarId={data.contexto.anio_escolar_id}
        nivel={lastSection.nivel}
        grado={lastSection.grado}
        fechaRetiro={data.contexto.fecha_retiro || lastSection.fecha_fin || ''}
        onClose={() => setShowReingreso(false)}
        onCheckState={onReload}
        onSuccess={() => {
          setShowReingreso(false);
          onReload?.();
        }}
      />
    )}
  </div>;
}
