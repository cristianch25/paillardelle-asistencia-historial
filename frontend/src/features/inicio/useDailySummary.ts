import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../shared/api/apiError';
import { getDailySummary } from './dailySummary.api';
import type { DailySummary } from './dailySummary';

export function useDailySummary(yearId: string, fecha: string, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: DailySummary | null; error: string }>({ key: '', data: null, error: '' });
  const key = JSON.stringify([yearId, fecha, revision]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void Promise.resolve().then(() => current ? getDailySummary(yearId, fecha, () => current) : null).then(data => {
      if (current && data) setResult({ key, data, error: '' });
    }).catch((error: unknown) => {
      if (current && !axios.isCancel(error)) setResult({ key, data: null, error: `No se pudo obtener el resumen diario completo. ${apiErrorMessage(error)}` });
    });
    return () => { current = false; };
  }, [yearId, fecha, enabled, key]);
  return { data: enabled && result.key === key ? result.data : null, loading: enabled && result.key !== key,
    error: enabled && result.key === key ? result.error : '', retry: () => setRevision(value => value + 1) };
}
