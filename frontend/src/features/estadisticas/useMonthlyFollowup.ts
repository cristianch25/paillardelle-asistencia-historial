import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../shared/api/apiError';
import { peruToday } from '../../shared/dates/civilDate';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';
import { statisticsRange, initialStatisticsDate } from './statisticsPeriod';
import { getMonthlyFollowup } from './monthlyFollowup.api';
import type { MonthlyFollowupQuery, MonthlyFollowupResponse } from './monthlyFollowup.types';

export function useMonthlyFollowup(year: SchoolYear | undefined, level: EducationLevel | '', enabled: boolean) {
  const [selection, setSelection] = useState({ yearId: '', month: '' });
  const [position, setPosition] = useState({ key: '', page: 1 }), [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: MonthlyFollowupResponse | null; error: string }>({ key: '', data: null, error: '' });
  const month = selection.yearId === year?.id ? selection.month : initialStatisticsDate(peruToday(), year).slice(0, 7);
  const range = statisticsRange('mes', `${month}-01`, year);
  const filterKey = JSON.stringify([year?.id, month, level]), page = position.key === filterKey ? position.page : 1;
  const query: MonthlyFollowupQuery | null = enabled && year && !range.error ? {
    anio_escolar_id: year.id, mes: month, ...(level ? { nivel: level } : {}), page, limit: 20,
  } : null;
  const serialized = JSON.stringify(query), key = JSON.stringify([serialized, revision]);
  useEffect(() => {
    const filters = JSON.parse(serialized) as MonthlyFollowupQuery | null;
    if (!filters) return;
    let current = true;
    const controller = new AbortController();
    void getMonthlyFollowup(filters, controller.signal).then(data => {
      if (current) setResult({ key, data, error: '' });
    }).catch((error: unknown) => {
      if (current && !axios.isCancel(error)) setResult({ key, data: null, error: apiErrorMessage(error) });
    });
    return () => { current = false; controller.abort(); };
  }, [serialized, key]);
  return { month, range, page, data: query && result.key === key ? result.data : null,
    levels: result.data?.niveles_autorizados ?? [], loading: Boolean(query && result.key !== key),
    error: query && result.key === key ? result.error : '',
    setMonth: (value: string) => setSelection({ yearId: year?.id ?? '', month: value }),
    setPage: (value: number) => setPosition({ key: filterKey, page: value }),
    refresh: () => { setPosition({ key: filterKey, page: 1 }); setRevision(value => value + 1); } };
}
