import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../shared/api/apiError';
import { validCivilDate } from '../../shared/dates/civilDate';
import { getCalendarDay, type CalendarResponse } from '../organizacion-escolar/calendario-lectivo/calendario.api';
import type { SectionSelection } from '../organizacion-escolar/secciones/secciones.types';

type Outcome = { data: CalendarResponse | null; error: string };
export function observeAttendanceCalendar(selection: SectionSelection, fecha: string, receive: (value: Outcome) => void) {
  let current = true;
  void getCalendarDay(selection.year.id, selection.section.nivel, fecha).then(data => {
    if (current) receive({ data, error: '' });
  }).catch((failure: unknown) => {
    if (!current || axios.isCancel(failure)) return;
    const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
    receive({ data: null, error: status === 400 ? 'La fecha no está dentro del intervalo disponible para este calendario.'
      : status === 404 ? 'El calendario no está disponible para esta consulta.' : apiErrorMessage(failure) });
  });
  return () => { current = false; };
}

export function useAttendanceCalendar(selection: SectionSelection | null, fecha: string) {
  const [revision, setRevision] = useState(0);
  const key = useMemo(() => ({ selection, fecha, revision }), [selection, fecha, revision]);
  const enabled = Boolean(selection) && validCivilDate(fecha);
  const [result, setResult] = useState<Outcome & { key: typeof key | null }>({ key: null, data: null, error: '' });
  useEffect(() => {
    if (!enabled || !selection) return;
    return observeAttendanceCalendar(selection, fecha, outcome => setResult({ ...outcome, key }));
  }, [enabled, selection, fecha, key]);
  return {
    data: enabled && result.key === key ? result.data : null,
    error: enabled && result.key === key ? result.error : '',
    loading: enabled && result.key !== key,
    retry: () => setRevision(value => value + 1),
  };
}
