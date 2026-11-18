import { useEffect, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../shared/api/apiError';
import { getAttendanceStatistics } from './statistics.api';
import type { AttendanceStatistics, StatisticsQuery } from './statistics.types';

export function useStatistics(query: StatisticsQuery | null) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: AttendanceStatistics | null;
    levels: AttendanceStatistics['niveles_autorizados']; error: string }>({ key: '', data: null, levels: [], error: '' });
  const serialized = JSON.stringify(query), key = JSON.stringify([serialized, revision]);
  useEffect(() => {
    const filters = JSON.parse(serialized) as StatisticsQuery | null;
    if (!filters) return;
    const controller = new AbortController();
    let current = true;
    void getAttendanceStatistics(filters, controller.signal).then(data => {
      if (current) setResult({ key, data, levels: data.niveles_autorizados, error: '' });
    }).catch((error: unknown) => {
      if (current && !axios.isCancel(error)) setResult(previous => ({ key, data: null,
        levels: previous.levels, error: apiErrorMessage(error) }));
    });
    return () => { current = false; controller.abort(); };
  }, [serialized, key]);
  return { data: query && result.key === key ? result.data : null,
    levels: result.levels,
    loading: Boolean(query && result.key !== key), error: query && result.key === key ? result.error : '',
    retry: () => setRevision(value => value + 1) };
}
