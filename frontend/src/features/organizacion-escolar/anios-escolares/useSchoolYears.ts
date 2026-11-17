import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { getAllSchoolYears } from './aniosEscolares.api';
import type { SchoolYear } from './aniosEscolares.types';

export function useSchoolYears() {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; years: SchoolYear[]; error: string }>({
    revision: -1, years: [], error: '',
  });
  useEffect(() => {
    let current = true;
    getAllSchoolYears().then(years => {
      if (current) setResult({ revision, years, error: '' });
    }).catch((error: unknown) => {
      if (current && !axios.isCancel(error)) setResult({ revision, years: [], error: apiErrorMessage(error) });
    });
    return () => { current = false; };
  }, [revision]);
  return { years: result.years, error: result.error, loading: result.revision !== revision,
    retry: () => setRevision(value => value + 1) };
}
