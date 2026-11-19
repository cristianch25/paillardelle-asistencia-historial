import { useRef, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import type { SchoolYear } from './aniosEscolares.types';
import { useSchoolYears } from './useSchoolYears';

export function useSchoolYearManagement() {
  const years = useSchoolYears(), running = useRef(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  function refresh() {
    if (running.current) return;
    setUncertain(false); setError(''); setMessage(''); years.retry();
  }
  async function save(operation: () => Promise<SchoolYear>, success: string) {
    if (running.current || uncertain || years.loading || years.error) return false;
    running.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await operation(); setMessage(success); years.retry(); return true;
    } catch (cause) {
      const status = axios.isAxiosError(cause) ? cause.response?.status : undefined;
      const unknown = ![400, 401, 403, 404, 409, 413].includes(status ?? 0);
      setUncertain(unknown);
      const detail: unknown = axios.isAxiosError(cause) ? cause.response?.data?.error : undefined;
      setError(unknown ? 'No se pudo confirmar el resultado. Consulta los años antes de volver a realizar una operación.'
        : [400, 409].includes(status!) && typeof detail === 'string' ? detail : apiErrorMessage(cause));
      return false;
    } finally { running.current = false; setBusy(false); }
  }
  return { ...years, busy, uncertain, error: error || years.error, message, refresh, save };
}
