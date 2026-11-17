import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { getSections } from './secciones.api';
import type { SectionFilters, SectionsResponse } from './secciones.types';

// null consulta todos los años autorizados; '' espera una selección explícita de año.
export function useSecciones(yearId: string | null, filters: SectionFilters, page: number) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: SectionsResponse | null; error: string }>({
    key: '', data: null, error: '',
  });
  const { nivel, grado, activo } = filters;
  const key = JSON.stringify([yearId, nivel, grado, activo, page, revision]);
  useEffect(() => {
    if (yearId === '') return;
    let current = true;
    // Conservar la señal de sesión del cliente HTTP para mantener el tratamiento global de 401.
    getSections({ ...(yearId !== null ? { anio_escolar_id: yearId } : {}), page, limit: 20,
      ...(nivel ? { nivel } : {}), ...(grado ? { grado } : {}), ...(activo ? { activo } : {}) })
      .then(data => { if (current) setResult({ key, data, error: '' }); })
      .catch((error: unknown) => {
        if (current && !axios.isCancel(error)) setResult({ key, data: null,
          error: axios.isAxiosError(error) && error.response?.status === 400
            ? 'Los filtros no son válidos. Revisa el nivel y el grado seleccionados.' : apiErrorMessage(error) });
      });
    return () => { current = false; };
  }, [yearId, nivel, grado, activo, page, revision, key]);
  return {
    data: yearId !== '' && result.key === key ? result.data : null,
    error: yearId !== '' && result.key === key ? result.error : '',
    loading: yearId !== '' && result.key !== key,
    retry: () => setRevision(value => value + 1),
  };
}
