import { useEffect, useState } from 'react';
import axios from 'axios';
import { getManagedAttendance } from './managedAttendance.api';
import type { SupervisionFilters } from '../supervision/supervision.types';
import type { SupervisionDetail } from '../supervision/supervisionDetail.api';
import { apiErrorMessage } from '../../../shared/api/apiError';

export function useManagedAttendance(filters: SupervisionFilters, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; detail: SupervisionDetail | null; error: string }>({ key: '', detail: null, error: '' });
  const { anio_escolar_id, fecha, nivel, seccion_id } = filters;
  const key = JSON.stringify([anio_escolar_id, fecha, nivel, seccion_id, revision]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    Promise.resolve().then(() => current ? getManagedAttendance({ anio_escolar_id, fecha, nivel, seccion_id, page: 1 }, () => current) : null)
      .then(data => { if (current && data) setResult({ key, detail: data.detail, error: '' }); })
      .catch((error: unknown) => {
        if (current && !axios.isCancel(error)) setResult({ key, detail: null, error: apiErrorMessage(error) });
      });
    return () => { current = false; };
  }, [anio_escolar_id, fecha, nivel, seccion_id, key, enabled]);
  return { detail: enabled && result.key === key ? result.detail : null,
    error: enabled && result.key === key ? result.error : '', loading: enabled && result.key !== key,
    loaded: enabled && result.key === key, retry: () => setRevision(value => value + 1) };
}
