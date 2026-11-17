import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { validCivilDate } from '../../../shared/dates/civilDate';
import { getAttendanceSupervision } from './supervision.api';
import type { SupervisionFilters, SupervisionResponse } from './supervision.types';

type Result = { key: string; data: SupervisionResponse | null; error: string };

export function supervisionError(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 400) return 'Revisa los filtros: la fecha debe pertenecer al año escolar seleccionado.';
    if (error.response?.status === 404) return 'El año o la sección no están disponibles, o no tienes permiso para consultarlos.';
  }
  return apiErrorMessage(error);
}

export function useSupervisionQuery(filters: SupervisionFilters, enabled = true) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result>({ key: '', data: null, error: '' });
  const { anio_escolar_id, fecha, nivel, seccion_id, page } = filters;
  const ready = enabled && Boolean(anio_escolar_id && validCivilDate(fecha));
  const scope = JSON.stringify([anio_escolar_id, fecha, nivel, revision]);
  const key = JSON.stringify([scope, seccion_id, page]);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    // No sustituir la señal de sesión: el cliente compartido gestiona la expiración 401.
    getAttendanceSupervision({ anio_escolar_id, fecha, ...(nivel ? { nivel } : {}),
      ...(seccion_id ? { seccion_id } : {}), page, limit: 20 }).then(data => {
      if (!current) return;
      setResult({ key, data, error: '' });
    }).catch((error: unknown) => {
      if (current && !axios.isCancel(error)) setResult({ key, data: null, error: supervisionError(error) });
    });
    return () => { current = false; };
  }, [anio_escolar_id, fecha, nivel, seccion_id, page, key, scope, ready]);
  return {
    data: ready && result.key === key ? result.data : null,
    error: ready && result.key === key ? result.error : '',
    loading: ready && result.key !== key,
    retry: () => setRevision(value => value + 1),
  };
}
