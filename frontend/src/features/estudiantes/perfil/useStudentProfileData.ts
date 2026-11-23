// Consulta el perfil por estudiante, año y mes, descartando respuestas que ya no corresponden.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { getStudentProfile } from './profile.api';
import { apiErrorMessage } from '../../../shared/api/apiError';
import type { StudentProfile } from './profile.types';
export function useStudentProfileData(id: string, year: string, month: string, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: StudentProfile | null; error: string }>({ key: '', data: null, error: '' });
  // La clave evita mostrar datos anteriores mientras cambia la consulta o se vuelve a cargar.
  const key = JSON.stringify([id, year, month, revision]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const controller = new AbortController();
    void getStudentProfile(id, year, month, controller.signal).then(data => {
      if (current) setResult({ key, data, error: '' });
    }).catch((error: unknown) => {
      if (current && !axios.isCancel(error)) setResult({ key, data: null, error: apiErrorMessage(error) });
    });
    return () => { current = false; controller.abort(); };
  }, [id, year, month, enabled, key]);
  return { data: enabled && result.key === key ? result.data : null, error: enabled && result.key === key ? result.error : '',
    loading: enabled && result.key !== key, retry: () => setRevision(value => value + 1) };
}
