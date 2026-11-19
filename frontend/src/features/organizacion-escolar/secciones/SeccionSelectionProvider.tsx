import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { findAccessibleSection } from './secciones.api';
import { SeccionSelectionContext } from './SeccionSelectionContext';
import type { SectionSelection } from './secciones.types';
import { useNavigationProtection } from '../../../shared/navigation/NavigationProtectionContext';
import { useAuth } from '../../auth/AuthContext';
import { peruToday } from '../../../shared/dates/civilDate';

export default function SeccionSelectionProvider({ children }: { children: ReactNode }) {
  const { request } = useNavigationProtection();
  const accountId = useAuth().session?.user.id ?? null;
  const [workDate, setWorkDate] = useState(() => ({ accountId, date: peruToday() }));
  if (workDate.accountId !== accountId) setWorkDate({ accountId, date: peruToday() });
  const setAttendanceDate = useCallback((date: string) => setWorkDate({ accountId, date }), [accountId]);
  const [selected, setSelected] = useState<SectionSelection | null>(null);
  const [checking, setChecking] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [error, setError] = useState('');
  const candidate = useRef<SectionSelection | null>(null);
  const requestId = useRef(0);
  const invalidateRequests = useCallback(() => { requestId.current++; }, []);
  const clearSelection = useCallback(() => {
    requestId.current++;
    candidate.current = null;
    setSelected(null);
    setChecking(false);
    setUnverified(false);
    setError('');
  }, []);
  const clear = useCallback(() => { void request(clearSelection); }, [request, clearSelection]);
  const loadSelection = useCallback(async (selection: SectionSelection) => {
    const current = ++requestId.current;
    candidate.current = selection;
    setSelected(null);
    setChecking(true);
    setUnverified(false);
    setError('');
    try {
      const section = await findAccessibleSection(selection.section.id, selection.year.id);
      if (current !== requestId.current) return false;
      if (!section) {
        setError('La sección seleccionada ya no está disponible para tu cuenta. Selecciona otra sección.');
        return false;
      } else {
        const updated = { section, year: selection.year };
        candidate.current = updated;
        setSelected(updated);
        return true;
      }
    } catch (failure) {
      if (current === requestId.current && !axios.isCancel(failure)) {
        const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
        setUnverified(![401, 403, 404].includes(status ?? 0));
        setError(apiErrorMessage(failure));
      }
      return false;
    } finally {
      if (current === requestId.current) setChecking(false);
    }
  }, []);
  const revalidate = useCallback(async () => {
    if (candidate.current) await loadSelection(candidate.current);
  }, [loadSelection]);
  const select = useCallback(async (selection: SectionSelection) => {
    let available = false;
    const accepted = await request(async () => { available = await loadSelection(selection); });
    return accepted && available;
  }, [request, loadSelection]);
  useEffect(() => {
    const onFocus = () => { void revalidate(); };
    window.addEventListener('focus', onFocus);
    return () => {
      invalidateRequests();
      window.removeEventListener('focus', onFocus);
    };
  }, [revalidate, invalidateRequests]);
  return (
    <SeccionSelectionContext.Provider value={{ selected, checking, unverified, error, select, revalidate, clear,
      attendanceDate: workDate.date, setAttendanceDate }}>
      {children}
    </SeccionSelectionContext.Provider>
  );
}
