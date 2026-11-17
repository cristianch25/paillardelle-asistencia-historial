import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Section } from '../organizacion-escolar/secciones/secciones.types';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import { peruToday } from '../../shared/dates/civilDate';
import { getSectionAttendanceSummaries, type SectionAttendanceSummaries } from './sectionAttendanceSummaries.api';

export function useSectionAttendanceSummaries(sections: Section[], years: SchoolYear[], ready = true) {
  const { session } = useAuth();
  const [date, setDate] = useState(peruToday);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ key: '', summaries: {} as SectionAttendanceSummaries });
  const scope = JSON.stringify([session?.user.id, session?.user.rol, session?.user.nivel_asignado, session?.expiresAt]);
  const input = JSON.stringify({ sections, years });
  const key = JSON.stringify([scope, input, date, revision, ready]);
  useEffect(() => {
    const refresh = () => { setDate(peruToday()); setRevision(value => value + 1); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const dayTimer = window.setInterval(() => setDate(peruToday()), 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(dayTimer);
      window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  useEffect(() => {
    if (!session || !sections.length || !ready) return;
    let current = true;
    const snapshot = JSON.parse(input) as { sections: Section[]; years: SchoolYear[] };
    // La microtarea evita solicitudes del primer efecto invalidado por StrictMode.
    void Promise.resolve().then(async () => {
      if (!current) return;
      const summaries = await getSectionAttendanceSummaries(snapshot.sections, snapshot.years, date, () => current);
      if (current && summaries) setResult({ key, summaries });
    });
    return () => { current = false; };
  }, [scope, input, date, key, session, sections.length, ready]);
  return { date, summaries: result.key === key ? result.summaries : {},
    retry: () => { setDate(peruToday()); setRevision(value => value + 1); } };
}
