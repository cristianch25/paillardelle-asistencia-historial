import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { findAccessibleSection } from './secciones.api';
import { SeccionSelectionContext } from './SeccionSelectionContext';
import type { SectionSelection } from './secciones.types';

export default function SeccionSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<SectionSelection | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const candidate = useRef<SectionSelection | null>(null);
  const requestId = useRef(0);
  const invalidateRequests = useCallback(() => { requestId.current++; }, []);
  const clear = useCallback(() => {
    requestId.current++;
    candidate.current = null;
    setSelected(null);
    setChecking(false);
    setError('');
  }, []);
  const select = useCallback(async (selection: SectionSelection) => {
    const current = ++requestId.current;
    candidate.current = selection;
    setSelected(null);
    setChecking(true);
    setError('');
    try {
      const section = await findAccessibleSection(selection.section.id, selection.year.id);
      if (current !== requestId.current) return;
      if (!section) {
        setError('La sección seleccionada ya no está disponible para tu cuenta. Selecciona otra sección.');
      } else {
        const updated = { section, year: selection.year };
        candidate.current = updated;
        setSelected(updated);
      }
    } catch (failure) {
      if (current === requestId.current && !axios.isCancel(failure)) setError(apiErrorMessage(failure));
    } finally {
      if (current === requestId.current) setChecking(false);
    }
  }, []);
  const revalidate = useCallback(async () => {
    if (candidate.current) await select(candidate.current);
  }, [select]);
  useEffect(() => {
    const onFocus = () => { void revalidate(); };
    window.addEventListener('focus', onFocus);
    return () => {
      invalidateRequests();
      window.removeEventListener('focus', onFocus);
    };
  }, [revalidate, invalidateRequests]);
  return (
    <SeccionSelectionContext.Provider value={{ selected, checking, error, select, revalidate, clear }}>
      {children}
    </SeccionSelectionContext.Provider>
  );
}
