import { useEffect, useState } from 'react';
import { getSections } from '../organizacion-escolar/secciones/secciones.api';
import type { Section } from '../organizacion-escolar/secciones/secciones.types';
import { apiErrorMessage } from '../../shared/api/apiError';

export function useReportSections(yearId: string) {
  const [revision, setRevision] = useState(0), key = `${yearId}:${revision}`;
  const [result, setResult] = useState<{ key: string; rows: Section[]; error: string }>({ key: '', rows: [], error: '' });
  useEffect(() => {
    if (!yearId) return;
    let current = true;
    async function load() {
      const rows: Section[] = [], seen = new Set<string>();
      for (let page = 1; ; page++) {
        const data = await getSections({ anio_escolar_id: yearId, page, limit: 100 });
        if (data.pagination.page !== page || data.secciones.some(row => row.anio_escolar_id !== yearId || seen.has(row.id))) {
          throw new Error('Listado de secciones inconsistente.');
        }
        for (const row of data.secciones) { seen.add(row.id); rows.push(row); }
        if (!data.pagination.has_more) return rows;
        if (!data.secciones.length) throw new Error('Paginación sin progreso.');
      }
    }
    load().then(rows => { if (current) setResult({ key, rows, error: '' }); })
      .catch(error => { if (current) setResult({ key, rows: [], error: apiErrorMessage(error) }); });
    return () => { current = false; };
  }, [yearId, key]);
  return { sections: result.key === key ? result.rows : [], error: result.key === key ? result.error : '',
    loading: Boolean(yearId) && result.key !== key, retry: () => setRevision(value => value + 1) };
}
