import { useEffect, useState } from 'react';
import axios from 'axios';
import { getSupervisionDetail, type SupervisionDetail } from './supervisionDetail.api';
import { apiErrorMessage } from '../../../shared/api/apiError';

export function useSupervisionDetail(id: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: SupervisionDetail | null; error: string }>({ key: '', data: null, error: '' });
  const key = JSON.stringify([id, revision]);
  useEffect(() => {
    let current = true;
    // Dejar pasar el montaje/limpieza inicial de StrictMode antes de iniciar HTTP.
    Promise.resolve().then(() => current ? getSupervisionDetail(id, () => current) : null).then(data => {
      if (current && data) setResult({ key, data, error: '' });
    }).catch((error: unknown) => {
      if (!current || axios.isCancel(error)) return;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      setResult({ key, data: null, error: status === 403 || status === 404
        ? 'Esta sesión no está disponible, o no tienes permiso para consultarla.' : apiErrorMessage(error) });
    });
    return () => { current = false; };
  }, [id, key]);
  return { data: result.key === key ? result.data : null, error: result.key === key ? result.error : '',
    loading: result.key !== key, retry: () => setRevision(value => value + 1) };
}
