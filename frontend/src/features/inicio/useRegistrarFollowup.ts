import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth/AuthContext';
import { apiErrorMessage } from '../../shared/api/apiError';
import { initialSchoolYear } from '../organizacion-escolar/anios-escolares/initialSchoolYear';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import { getMonthlyFollowup } from '../estadisticas/monthlyFollowup.api';
import type { MonthlyFollowupQuery, MonthlyFollowupResponse } from '../estadisticas/monthlyFollowup.types';

export function useRegistrarFollowup(years: SchoolYear[], date: string, ready: boolean) {
  const { session } = useAuth(), month = date.slice(0, 7);
  const [revision, setRevision] = useState(0);
  const candidates = years.filter(year => year.fecha_inicio.slice(0, 7) <= month && year.fecha_fin.slice(0, 7) >= month);
  const yearId = initialSchoolYear(candidates, new Date(`${date}T12:00:00Z`));
  const enabled = ready && session?.user.rol === 'REGISTRADOR' && Boolean(yearId);
  const query: MonthlyFollowupQuery | null = enabled ? { anio_escolar_id: yearId, mes: month, page: 1, limit: 5 } : null;
  const serialized = JSON.stringify(query), key = JSON.stringify([session?.user.id, session?.user.rol, session?.expiresAt, serialized, revision]);
  const [result, setResult] = useState<{ key: string; data: MonthlyFollowupResponse | null; error: string }>({ key: '', data: null, error: '' });
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => {
    const filters = JSON.parse(serialized) as MonthlyFollowupQuery | null;
    if (!filters) return;
    let current = true;
    const controller = new AbortController();
    void Promise.resolve().then(() => current ? getMonthlyFollowup(filters, controller.signal) : null)
      .then(data => { if (current && data) setResult({ key, data, error: '' }); })
      .catch(error => { if (current && !axios.isCancel(error)) setResult({ key, data: null, error: apiErrorMessage(error) }); });
    return () => { current = false; controller.abort(); };
  }, [serialized, key]);
  return { data: enabled && result.key === key ? result.data : null, error: enabled && result.key === key ? result.error : '',
    loading: enabled && result.key !== key, available: Boolean(yearId), month, retry: () => setRevision(value => value + 1) };
}
