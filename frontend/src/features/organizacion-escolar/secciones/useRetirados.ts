import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { getRetiredStudents, type RetiredStudentEntry } from '../../matriculas/matriculas.api';

export function useRetirados(sectionId: string | null) {
  const [revision, setRevision] = useState(0);
  const key = useMemo(() => ({ sectionId, revision }), [sectionId, revision]);
  const [result, setResult] = useState<{
    key: typeof key | null; data: RetiredStudentEntry[]; error: string;
  }>({ key: null, data: [], error: '' });

  useEffect(() => {
    if (!sectionId) return;
    let current = true;
    void Promise.resolve().then(() => current ? getRetiredStudents(sectionId) : null).then(data => {
      if (!current) return;
      if (!Array.isArray(data)) throw new Error('Listado de retirados no válido.');
      setResult({ key, data, error: '' });
    }).catch((failure: unknown) => {
      if (current) setResult({ key, data: [], error: apiErrorMessage(failure) });
    });
    return () => { current = false; };
  }, [sectionId, key]);

  // Ocultar datos anteriores desde el render, incluso antes de la limpieza del efecto.
  const current = Boolean(sectionId) && result.key === key;
  return {
    data: current ? result.data : [],
    error: current ? result.error : '',
    loading: Boolean(sectionId) && !current,
    retry: () => setRevision(value => value + 1),
  };
}
