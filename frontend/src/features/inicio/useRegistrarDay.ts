import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiErrorMessage } from '../../shared/api/apiError';
import { peruToday, validCivilDate } from '../../shared/dates/civilDate';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import type { SupervisionSection } from '../asistencias/supervision/supervision.types';
import { getRegistrarDay } from './registrarDay';

export function useRegistrarDay(years: SchoolYear[], ready: boolean, referenceDate?: string) {
  const { session } = useAuth();
  const [today, setToday] = useState(peruToday), [revision, setRevision] = useState(0);
  const date = referenceDate ?? today, input = JSON.stringify(years);
  const enabled = session?.user.rol === 'REGISTRADOR' && ready && validCivilDate(date);
  const key = JSON.stringify([session?.user.id, session?.user.rol, session?.expiresAt, input, date, revision]);
  const [result, setResult] = useState<{ key: string; data: SupervisionSection[] | null; error: string }>({ key: '', data: null, error: '' });
  useEffect(() => {
    const refresh = () => { setToday(peruToday()); setRevision(value => value + 1); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = window.setInterval(() => setToday(peruToday()), 60_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void Promise.resolve().then(() => current ? getRegistrarDay(JSON.parse(input) as SchoolYear[], date, () => current) : null)
      .then(data => { if (current && data) setResult({ key, data, error: '' }); })
      .catch(error => { if (current) setResult({ key, data: null, error: apiErrorMessage(error) }); });
    return () => { current = false; };
  }, [enabled, key, input, date]);
  return { date, data: enabled && result.key === key ? result.data : null, loading: enabled && result.key !== key,
    error: enabled && result.key === key ? result.error : '', retry: () => setRevision(value => value + 1) };
}
