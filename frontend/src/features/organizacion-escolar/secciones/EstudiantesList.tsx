import { useContext, useState } from 'react';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import Button from '../../../shared/components/Button';
import { AuthContext } from '../../auth/AuthContext';
import type { PadronEntry } from './padron.types';
import StudentProfileButton from '../../estudiantes/perfil/StudentProfileButton';
import EnrollmentWithdrawDialog from '../../matriculas/EnrollmentWithdrawDialog';

export default function EstudiantesList({
  entries,
  yearId,
  date,
  canWithdraw: canWithdrawProp,
  onRefresh,
}: {
  entries: PadronEntry[];
  yearId?: string;
  date?: string;
  canWithdraw?: boolean;
  onRefresh?: () => void;
}) {
  const [withdrawTarget, setWithdrawTarget] = useState<PadronEntry | null>(null);
  const auth = useContext(AuthContext);
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
              <li key={matricula_seccion_id} className="space-y-1 p-4 sm:p-5">
                <p className="break-words font-medium text-institutional-950">
                  {[estudiante.apellido_paterno, estudiante.apellido_materno, estudiante.nombres].filter(Boolean).join(' ')}
                </p>
                {estudiante.codigo_estudiante && <p className="break-words text-sm text-slate-600">Código: {estudiante.codigo_estudiante}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StudentProfileButton studentId={estudiante.id} yearId={yearId} month={date?.slice(0, 7)} />
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
          onClose={() => setWithdrawTarget(null)}
          onSuccess={() => {
            setWithdrawTarget(null);
            onRefresh?.();
          }}
        />
      )}
    </section>
  );
}
