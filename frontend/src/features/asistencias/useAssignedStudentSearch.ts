import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiErrorMessage } from '../../shared/api/apiError';
import { validCivilDate } from '../../shared/dates/civilDate';
import { loadAssignedStudents, filterAssignedStudents, type AssignedStudent } from './assignedStudents.api';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';

export function useAssignedStudentSearch(years: SchoolYear[], date: string, query: string) {
  const { session } = useAuth();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ key: '', students: [] as AssignedStudent[], error: '' });
  const scope = JSON.stringify([session?.user.id, session?.expiresAt, session?.user.rol]);
  const input = JSON.stringify(years);
  const enabled = session?.user.rol === 'REGISTRADOR' && Boolean(query.trim()) && validCivilDate(date) && years.length > 0;
  const key = JSON.stringify([scope, input, date, revision, enabled]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void Promise.resolve().then(async () => {
      if (!current) return;
      try {
        const students = await loadAssignedStudents(JSON.parse(input) as SchoolYear[], date, () => current);
        if (current && students) setResult({ key, students, error: '' });
      } catch (failure) {
        if (current) setResult({ key, students: [], error: apiErrorMessage(failure) });
      }
    });
    return () => { current = false; };
  }, [enabled, key, date, input]);
  return { matches: enabled && result.key === key ? filterAssignedStudents(result.students, query) : [],
    loading: enabled && result.key !== key, error: enabled && result.key === key ? result.error : '',
    refresh: () => setRevision(value => value + 1) };
}
