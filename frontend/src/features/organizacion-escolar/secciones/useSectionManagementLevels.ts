import { useEffect, useState } from 'react';
import { getSectionManagementLevels } from './secciones.api';
import { apiErrorMessage } from '../../../shared/api/apiError';
import type { EducationLevel } from './secciones.types';

export function useSectionManagementLevels() {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; levels: EducationLevel[]; error: string } | null>(null);
  useEffect(() => {
    let current = true;
    Promise.resolve().then(() => current ? getSectionManagementLevels() : null).then(levels => {
      if (current && levels) setResult({ revision, levels, error: '' });
    }).catch((error: unknown) => {
      if (current) setResult({ revision, levels: [], error: `No se pudieron comprobar los niveles autorizados. ${apiErrorMessage(error)}` });
    });
    return () => { current = false; };
  }, [revision]);
  const ready = result?.revision === revision;
  return { levels: ready ? result.levels : [], loading: !ready, error: ready ? result.error : '',
    retry: () => setRevision(value => value + 1) };
}
