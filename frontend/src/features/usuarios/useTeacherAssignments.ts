import { useEffect, useRef, useState } from 'react';
import { getAssignmentCatalog } from './assignments.api';
import { userFailure, uncertainUserFailure } from './usuarios.api';
import type { AssignmentCatalog } from './usuarios.types';

export function useTeacherAssignments() {
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<{ revision: number; data: AssignmentCatalog | null; error: string }>({ revision: -1, data: null, error: '' });
  const running = useRef<object | null>(null);
  useEffect(() => () => { running.current = null; }, []);
  useEffect(() => {
    let current = true;
    getAssignmentCatalog().then(data => { if (current) { setResult({ revision, data, error: '' }); setUncertain(false); } })
      .catch(error => { if (current) setResult({ revision, data: null, error: userFailure(error) }); });
    return () => { current = false; };
  }, [revision]);
  const data = result.revision === revision && !uncertain ? result.data : null;
  function refresh() { if (!running.current) { setNotice(''); setRevision(value => value + 1); } }
  async function perform(work: () => Promise<void>) {
    if (!data || running.current) return false;
    const token = {}; running.current = token; setBusy(true); setNotice('');
    try {
      await work(); if (running.current !== token) return false;
      setNotice('Asignaciones actualizadas.'); setRevision(value => value + 1); return true;
    } catch (error) {
      if (running.current !== token) return false;
      const unknown = uncertainUserFailure(error); setUncertain(unknown);
      setNotice(unknown ? 'No se pudo confirmar el resultado. Actualiza la consulta antes de volver a intentar.' : userFailure(error));
      return false;
    } finally { if (running.current === token) { running.current = null; setBusy(false); } }
  }
  return { data, busy, notice, error: result.revision === revision ? result.error : '', loading: result.revision !== revision, refresh, perform };
}
