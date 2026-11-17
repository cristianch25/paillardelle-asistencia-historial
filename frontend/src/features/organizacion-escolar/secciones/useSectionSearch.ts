import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import type { Section } from './secciones.types';
import { getSectionSearchCatalog } from './sectionSearch.api';

export function useSectionSearch(yearId: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Section[] | null; error: string }>({ key: '', data: null, error: '' });
  const key = JSON.stringify([yearId, revision]);
  useEffect(() => {
    if (!yearId) return;
    let current = true;
    Promise.resolve().then(() => current ? getSectionSearchCatalog(yearId, () => current) : null).then(data => {
      if (current && data) setResult({ key, data, error: '' });
    }).catch((error: unknown) => {
      if (current && !axios.isCancel(error)) setResult({ key, data: null,
        error: `No se pudieron cargar todas las secciones. ${apiErrorMessage(error)}` });
    });
    return () => { current = false; };
  }, [yearId, key]);
  return { data: yearId && result.key === key ? result.data : null, error: yearId && result.key === key ? result.error : '',
    loading: Boolean(yearId) && result.key !== key, retry: () => setRevision(value => value + 1) };
}
