import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { getPadron } from './padron.api';
import { validCivilDate } from '../../../shared/dates/civilDate';
import type { PadronResponse } from './padron.types';
import type { SectionSelection } from './secciones.types';

type Outcome = { data: PadronResponse | null; error: string };

// La limpieza invalida respuestas sin sustituir la señal de sesión del cliente HTTP.
export function observePadron(sectionId: string, fecha: string, receive: (value: Outcome) => void) {
  let current = true;
  void Promise.resolve().then(() => current ? getPadron(sectionId, fecha) : null).then(data => {
    if (current && data) receive({ data, error: '' });
  }).catch((failure: unknown) => {
    if (!current || axios.isCancel(failure)) return;
    const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
    const error = status === 404
      ? 'La sección no está disponible o no tienes permiso para consultar su padrón en esta fecha.'
      : status === 400 ? 'Revisa la fecha de consulta. Debe ser una fecha completa y válida.'
        : !status && axios.isAxiosError(failure)
          ? 'No se pudo consultar a los estudiantes. Comprueba tu conexión e intenta nuevamente.'
          : apiErrorMessage(failure);
    receive({ data: null, error });
  });
  return () => { current = false; };
}

export function usePadron(selection: SectionSelection | null, fecha: string) {
  const [revision, setRevision] = useState(0);
  // La identidad de la selección cambia también después de una revalidación por foco.
  const key = useMemo(() => ({ selection, fecha, revision }), [selection, fecha, revision]);
  const enabled = Boolean(selection) && validCivilDate(fecha);
  const [result, setResult] = useState<Outcome & { key: typeof key | null }>({ key: null, data: null, error: '' });
  useEffect(() => {
    if (!enabled || !selection) return;
    return observePadron(selection.section.id, fecha, outcome => setResult({ ...outcome, key }));
  }, [enabled, selection, fecha, key]);
  return {
    data: enabled && result.key === key ? result.data : null,
    error: enabled && result.key === key ? result.error : '',
    loading: enabled && result.key !== key,
    retry: () => setRevision(value => value + 1),
  };
}
