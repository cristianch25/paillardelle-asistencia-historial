import { useEffect, useRef, useState } from 'react';
import { getAttendance } from '../asistencias.api';
import type { AttendanceDetail } from '../asistencias.types';
import { attendanceFailureStatus } from '../attendanceSaveError';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { useUnsavedChanges } from '../../../shared/navigation/useUnsavedChanges';
import { assertCorrectionDetail, correctionRequest, saveSupervisionCorrection } from './supervisionCorrection';

type Phase = 'idle' | 'saving' | 'review' | 'refreshing' | 'denied';
export function useSupervisionCorrection(initial: AttendanceDetail) {
  const [data, setData] = useState(initial);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const operation = useRef<object | null>(null);
  useEffect(() => () => { operation.current = null; }, []);
  const busy = phase === 'saving' || phase === 'refreshing';
  useUnsavedChanges(`supervision-correction:${initial.sesion.id}`, false, busy);
  function deny(status: number | undefined) {
    if (![401, 403, 404].includes(status ?? 0)) return false;
    setPhase('denied'); setError('La asistencia no está disponible, o ya no tienes permiso para modificarla.');
    return true;
  }
  async function save(id: string, state: string) {
    if (operation.current || phase !== 'idle') return;
    setMessage(''); setError('');
    try { correctionRequest(data, id, state); }
    catch (failure) { setError((failure as Error).message); return; }
    const token = {}; operation.current = token; setPhase('saving');
    try {
      const current = await saveSupervisionCorrection(data, id, state);
      if (operation.current !== token) return;
      setData(current); setPhase('idle'); setMessage('Corrección guardada correctamente.');
      return current;
    } catch (failure) {
      if (operation.current !== token) return;
      const status = attendanceFailureStatus(failure);
      if (deny(status)) return;
      if (status === 400 || status === 413) {
        setPhase('idle'); setError('El servidor rechazó la corrección. Revisa el estado antes de volver a confirmar.');
      } else {
        setPhase('review'); setError(status === 409
          ? 'La corrección encontró un conflicto de versión o de condiciones de escritura. Consulta el estado actual antes de decidir otro intento.'
          : 'No se pudo confirmar el guardado. El resultado es incierto; consulta el estado actual antes de decidir otro intento.');
      }
    } finally { if (operation.current === token) operation.current = null; }
  }
  async function refresh() {
    if (operation.current || phase !== 'review') return;
    const token = {}; operation.current = token; setPhase('refreshing'); setError('');
    try {
      const current = await getAttendance(data.sesion.id);
      if (operation.current !== token) return;
      assertCorrectionDetail(data, current);
      setData(current); setPhase('idle'); setMessage('Estado actual consultado. Revisa los datos antes de elegir otra corrección.');
      return current;
    } catch (failure) {
      if (operation.current !== token || deny(attendanceFailureStatus(failure))) return;
      setPhase('review'); setError(`No se pudo consultar el estado actual. ${apiErrorMessage(failure)}`);
    } finally { if (operation.current === token) operation.current = null; }
  }
  return { data, phase, error, message, busy, save, refresh };
}
