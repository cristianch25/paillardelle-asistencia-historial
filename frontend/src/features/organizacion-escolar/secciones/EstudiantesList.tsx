import { useContext, useState } from 'react';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import Button from '../../../shared/components/Button';
import { AuthContext } from '../../auth/AuthContext';
import type { PadronEntry } from './padron.types';
import type { Section } from './secciones.types';
import StudentProfileButton from '../../estudiantes/perfil/StudentProfileButton';
import EnrollmentWithdrawDialog from '../../matriculas/EnrollmentWithdrawDialog';
import SectionChangeDialog from '../../matriculas/SectionChangeDialog';

export default function EstudiantesList({
  entries,
  section,
  yearId,
  date,
  canWithdraw: canWithdrawProp,
  onRefresh,
}: {
  entries: PadronEntry[];
  section?: Pick<Section, 'id' | 'anio_escolar_id' | 'nivel' | 'grado' | 'letra'>;
  yearId?: string;
  date?: string;
  canWithdraw?: boolean;
  onRefresh?: () => void;
}) {
  const [withdrawTarget, setWithdrawTarget] = useState<PadronEntry | null>(null);
  const [changeSectionTarget, setChangeSectionTarget] = useState<PadronEntry | null>(null);
  const auth = useContext(AuthContext);
  const registrar = auth?.session?.user.rol === 'REGISTRADOR';
  const studentName = (entry: PadronEntry) => [entry.estudiante.apellido_paterno, entry.estudiante.apellido_materno, entry.estudiante.nombres].filter(Boolean).join(' ');
  const nameKey = (entry: PadronEntry) => studentName(entry).normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
  const names = new Set<string>(), duplicates = new Set<string>();
  if (registrar) for (const entry of entries) {
    const key = nameKey(entry);
    if (names.has(key)) duplicates.add(key);
    names.add(key);
  }
  const canWithdraw = canWithdrawProp ?? (auth?.session?.user.rol === 'ADMIN' || auth?.session?.user.rol === 'SUBDIRECCION');
  const count = new Set(entries.map(entry => entry.estudiante_id)).size;
  // No elegir arbitrariamente un vínculo ni contar filas duplicadas como personas distintas.
  if (count !== entries.length) return <ErrorState message="El padrón contiene vínculos duplicados de estudiantes. Solicita su revisión antes de continuar." />;
  return (
    <section aria-label="Estudiantes de la fecha consultada" className="space-y-3">
      <p role="status" className="font-semibold">{count} {count === 1 ? 'estudiante' : 'estudiantes'} en esta fecha</p>
      {!entries.length ? <EmptyState message="No hay estudiantes matriculados en esta sección para la fecha consultada." /> : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {entries.map(entry => {
            const { matricula_seccion_id, estudiante } = entry;
            return (
              <li key={matricula_seccion_id} className={registrar ? 'space-y-1 px-4 py-3 sm:px-5' : 'space-y-1 p-4 sm:p-5'}>
                <p className={`break-words text-institutional-950 ${registrar ? 'text-lg font-semibold leading-snug' : 'font-medium'}`}>
                  {studentName(entry)}
                </p>
                {estudiante.codigo_estudiante && (!registrar || duplicates.has(nameKey(entry)))
                  && <p className="break-words text-sm text-slate-600">Código: {estudiante.codigo_estudiante}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StudentProfileButton studentId={estudiante.id} yearId={yearId} month={date?.slice(0, 7)} />
                  {canWithdraw && section && entry.estado === 'ACTIVA' && entry.fecha_retiro === null && (
                    <Button variant="secondary" onClick={() => setChangeSectionTarget(entry)}>
                      Cambiar sección
                    </Button>
                  )}
                  {canWithdraw && entry.estado === 'ACTIVA' && entry.fecha_retiro === null && (
                    <Button variant="secondary" onClick={() => setWithdrawTarget(entry)}>
                      Retirar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {withdrawTarget && (
        <EnrollmentWithdrawDialog
          entry={withdrawTarget}
          onCheckState={onRefresh}
          onClose={() => setWithdrawTarget(null)}
          onSuccess={() => {
            setWithdrawTarget(null);
            onRefresh?.();
          }}
        />
      )}
      {changeSectionTarget && section && (
        <SectionChangeDialog
          entry={changeSectionTarget}
          onCheckState={onRefresh}
          currentSection={section}
          onClose={() => setChangeSectionTarget(null)}
          onSuccess={() => {
            setChangeSectionTarget(null);
            onRefresh?.();
          }}
        />
      )}
    </section>
  );
}
