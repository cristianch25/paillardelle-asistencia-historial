import { useEffect, useState } from 'react';
import axios from 'axios';
import { validCivilDate } from '../../../shared/dates/civilDate';
import type { Section } from '../../organizacion-escolar/secciones/secciones.types';
import { getSupervisionSections } from './supervision.api';
import { supervisionError } from './useSupervisionQuery';
import type { SupervisionFilters } from './supervision.types';

export function useSupervisionSections({ anio_escolar_id, fecha, nivel }: SupervisionFilters) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ key: '', sections: [] as Section[], error: '' });
  const ready = Boolean(anio_escolar_id && validCivilDate(fecha));
  const key = JSON.stringify([anio_escolar_id, fecha, nivel, revision]);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    Promise.resolve().then(() => current ? getSupervisionSections({ anio_escolar_id, fecha, ...(nivel ? { nivel } : {}) }, () => current) : null)
      .then(sections => {
        if (current && sections) setResult({ key, sections, error: '' });
      }).catch((error: unknown) => {
        if (current && !axios.isCancel(error)) setResult({ key, sections: [],
          error: `No se pudieron cargar las secciones. ${supervisionError(error)}` });
      });
    return () => { current = false; };
  }, [anio_escolar_id, fecha, nivel, key, ready]);
  return {
    sections: ready && result.key === key ? result.sections : [],
    error: ready && result.key === key ? result.error : '',
    loading: ready && result.key !== key,
    ready,
    retry: () => setRevision(value => value + 1),
  };
}
