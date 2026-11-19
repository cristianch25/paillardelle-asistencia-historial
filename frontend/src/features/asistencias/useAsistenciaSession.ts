import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { validCivilDate } from '../../shared/dates/civilDate';
import type { SectionSelection } from '../organizacion-escolar/secciones/secciones.types';
import { openAttendance } from './asistencias.api';
import { attendanceOpeningError } from './asistenciaError';
import type { AttendanceOpening } from './asistencias.types';
import { getAttendanceWorkspace } from './attendanceWorkspace';
import { apiErrorMessage } from '../../shared/api/apiError';

type Outcome = { data: AttendanceOpening | null; error: string };

// Solo se invoca desde la acción explícita. Invalidar no garantiza deshacer la apertura.
export function observeAttendanceOpening(id: string, fecha: string, receive: (outcome: Outcome) => void) {
  let current = true;
  void openAttendance(id, fecha).then(data => {
    if (current) receive({ data, error: '' });
  }).catch((failure: unknown) => {
    if (current && !axios.isCancel(failure)) receive({ data: null, error: attendanceOpeningError(failure) });
  });
  return () => { current = false; };
}

export function attendanceScopeKey(accountId: string | null, selection: SectionSelection | null, fecha: string) {
  return accountId && selection ? JSON.stringify([accountId, selection.year.id, selection.section.id, fecha]) : null;
}

export function useAsistenciaSession(accountId: string | null, selection: SectionSelection | null,
  fecha: string, checking = false, automatic = false) {
  const key = attendanceScopeKey(accountId, selection, fecha);
  const [readRevision, setReadRevision] = useState(0);
  // Los datos completados usan una clave estable; las solicitudes, una generación separada.
  const generation = useMemo(() => ({ key, checking, readRevision }), [key, checking, readRevision]);
  const [result, setResult] = useState<Outcome & { key: string | null; operation: object | null }>({
    key, operation: null, data: null, error: '',
  });
  // Conservar solo durante una comprobación temporal; perder acceso invalida la caché.
  if (!checking && result.key !== key) setResult({ key, operation: null, data: null, error: '' });
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    pending.current?.();
    pending.current = null;
  }, [generation]);
  useEffect(() => {
    if (!automatic || !key || !selection || checking || !validCivilDate(fecha) || (result.key === key && result.data)) return;
    let current = true;
    void Promise.resolve().then(() => {
      if (!current) return null;
      setResult({ key, operation: generation, data: null, error: '' });
      return getAttendanceWorkspace(selection.year.id, selection.section.id, fecha);
    }).then(data => {
      if (current) setResult({ key, operation: null, data, error: '' });
    }).catch((failure: unknown) => {
      if (current && !axios.isCancel(failure)) setResult({ key, operation: null, data: null, error: apiErrorMessage(failure) });
    });
    return () => { current = false; };
  }, [automatic, key, selection, checking, fecha, generation, result.key, result.data]);
  function open() {
    if (!key || !selection || checking || !validCivilDate(fecha) || pending.current) return;
    setResult({ key, operation: generation, data: null, error: '' });
    pending.current = observeAttendanceOpening(selection.section.id, fecha, outcome => {
      pending.current = null;
      setResult({ ...outcome, key, operation: null });
    });
  }
  return {
    data: !checking && key && result.key === key ? result.data : null,
    error: !checking && key && result.key === key ? result.error : '',
    pending: !checking && Boolean(key) && result.key === key && result.operation === generation,
    open,
    retry: () => setReadRevision(value => value + 1),
  };
}
