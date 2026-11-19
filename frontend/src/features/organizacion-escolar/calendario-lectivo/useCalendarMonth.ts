import { useEffect, useState } from 'react';
import type { EducationLevel } from '../secciones/secciones.types';
import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';
import { calendarError, getCalendarLevels, getCalendarScope, type CalendarResponse } from './calendario.api';
import { monthRange } from './calendarDates';
import type { AuthUser } from '../../auth/auth.types';
import { calendarScopes } from './calendarScopes';

export function useCalendarMonth(year: SchoolYear | undefined, month: string, user: AuthUser) {
  const [scopeKey, setScope] = useState('');
  const [revision, setRevision] = useState(0);
  const [access, setAccess] = useState<{ key: string; levels: EducationLevel[]; error: string } | null>(null);
  const [result, setResult] = useState<{ key: string; data: CalendarResponse | null; error: string } | null>(null);
  const accessKey = `${year?.id ?? ''}:${revision}`;
  useEffect(() => {
    if (!year) return;
    let current = true;
    getCalendarLevels(year.id).then(levels => { if (current) setAccess({ key: accessKey, levels, error: '' }); })
      .catch(error => { if (current) setAccess({ key: accessKey, levels: [], error: calendarError(error) }); });
    return () => { current = false; };
  }, [year, accessKey]);
  const ready = access?.key === accessKey, levels = ready ? access.levels : [];
  const options = calendarScopes(user, levels);
  const scope = options.find(option => option.key === scopeKey) ?? options[0] ?? null;
  const selected = scope?.levels.join(',') ?? '';
  const key = `${accessKey}:${selected}:${month}`;
  useEffect(() => {
    let current = true;
    if (!year || !selected || !month) return;
    const { desde, hasta } = monthRange(month, year);
    getCalendarScope(year.id, selected.split(',') as EducationLevel[], desde, hasta).then(data => {
      if (current) setResult({ key, data, error: '' });
    }).catch(error => { if (current) setResult({ key, data: null, error: calendarError(error) }); });
    return () => { current = false; };
  }, [year, month, selected, key]);
  const current = result?.key === key;
  return { levels, scope, options, setScope, data: current ? result.data : null,
    error: ready && access.error || (current ? result.error : ''),
    loading: Boolean(year) && (!ready || Boolean(selected) && !current),
    refresh: () => setRevision(value => value + 1) };
}
