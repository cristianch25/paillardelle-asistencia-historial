import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { validCivilDate } from '../../../shared/dates/civilDate';
import { getSectionStaff, type SectionAssignment } from './sectionStaff.api';

export function useSectionStaff(sectionId: string, yearId: string, date: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: SectionAssignment[] | null; error: string }>({
    key: '', data: null, error: '',
  });
  const enabled = Boolean(sectionId && yearId && validCivilDate(date));
  const key = JSON.stringify([sectionId, yearId, date, revision]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    Promise.resolve().then(() => current ? getSectionStaff(sectionId, yearId, date, () => current) : null).then(data => {
      if (current && data) setResult({ key, data, error: '' });
    }).catch((error: unknown) => {
      if (current && !axios.isCancel(error)) setResult({ key, data: null,
        error: `No se pudo consultar el personal asignado. ${apiErrorMessage(error)}` });
    });
    return () => { current = false; };
  }, [enabled, sectionId, yearId, date, key]);
  return { data: enabled && result.key === key ? result.data : null,
    error: enabled && result.key === key ? result.error : '', loading: enabled && result.key !== key,
    retry: () => setRevision(value => value + 1) };
}
