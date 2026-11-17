import { useEffect, useState } from 'react';
import axios from 'axios';
import { validCivilDate } from '../../../shared/dates/civilDate';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { searchAttendanceStudents, validSearchQuery } from './studentSearch.api';
import type { StudentSearchResponse } from './studentSearch.types';

export function useStudentSearch(date: string, query: string, page: number, enabled = true) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: StudentSearchResponse | null; error: string }>({ key: '', data: null, error: '' });
  const key = JSON.stringify([date, query, page, revision]);
  const validation = !validCivilDate(date) ? 'Selecciona una fecha completa y válida.'
    : !validSearchQuery(query) ? 'La búsqueda admite hasta 120 caracteres y no puede contener caracteres de control.' : '';
  useEffect(() => {
    if (!enabled || validation) return;
    let current = true;
    const timer = window.setTimeout(() => {
      searchAttendanceStudents(date, query, page).then(data => {
        if (current) setResult({ key, data, error: '' });
      }).catch((error: unknown) => {
        if (current && !axios.isCancel(error)) setResult({ key, data: null, error: apiErrorMessage(error) });
      });
    }, 300);
    return () => { current = false; window.clearTimeout(timer); };
  }, [date, query, page, key, validation, enabled]);
  return { key, data: enabled && !validation && result.key === key ? result.data : null,
    error: enabled ? validation || (result.key === key ? result.error : '') : '', loading: enabled && !validation && result.key !== key,
    retry: () => setRevision(value => value + 1) };
}
