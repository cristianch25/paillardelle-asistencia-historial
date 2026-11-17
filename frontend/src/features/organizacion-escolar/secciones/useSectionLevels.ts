import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import type { AuthUser } from '../../auth/auth.types';
import { educationLevels, getAuthorizedSectionLevels } from './sectionLevels.api';
import type { EducationLevel } from './secciones.types';

type Outcome = { data: readonly EducationLevel[] | null; error: string };
export function observeSectionLevels(receive: (value: Outcome) => void) {
  let current = true;
  void getAuthorizedSectionLevels().then(data => {
    if (current) receive({ data, error: '' });
  }).catch((failure: unknown) => {
    if (current && !axios.isCancel(failure)) receive({ data: null, error: apiErrorMessage(failure) });
  });
  return () => { current = false; };
}

export function useSectionLevels(actor: Pick<AuthUser, 'id' | 'rol'> | null) {
  const [revision, setRevision] = useState(0);
  const query = actor?.rol === 'SUBDIRECCION';
  const key = JSON.stringify([actor?.id, actor?.rol, revision]);
  const [result, setResult] = useState<Outcome & { key: string }>({ key: '', data: null, error: '' });
  useEffect(() => {
    if (!query) return;
    return observeSectionLevels(outcome => setResult({ ...outcome, key }));
  }, [query, key]);
  useEffect(() => {
    if (!query) return;
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [query]);
  return {
    data: actor?.rol === 'ADMIN' ? educationLevels : query && result.key === key ? result.data : null,
    error: query && result.key === key ? result.error : '',
    loading: query && result.key !== key,
    retry: () => setRevision(value => value + 1),
  };
}
