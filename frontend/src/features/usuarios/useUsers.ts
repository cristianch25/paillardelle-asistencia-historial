import { useEffect, useRef, useState } from 'react';
import { getUsersCatalog, userFailure, uncertainUserFailure } from './usuarios.api';
import type { UsersCatalog } from './usuarios.types';

export function useUsers() {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; data: UsersCatalog | null; error: string }>({ revision: -1, data: null, error: '' });
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const operation = useRef<object | null>(null);
  useEffect(() => () => { operation.current = null; }, []);
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => current ? getUsersCatalog(() => current) : null).then(data => {
      if (current && data) { setResult({ revision, data, error: '' }); setUncertain(false); }
    }).catch((error: unknown) => {
      if (current) setResult({ revision, data: null, error: userFailure(error) });
    });
    return () => { current = false; };
  }, [revision]);
  const data = result.revision === revision && !uncertain ? result.data : null;
  async function perform(work: () => Promise<void>) {
    if (operation.current || !data) return false;
    const token = {}; operation.current = token; setBusy(true); setNotice('');
    try {
      await work();
      if (operation.current !== token) return false;
      setNotice('Operación confirmada.'); setRevision(value => value + 1); return true;
    } catch (error) {
      if (operation.current !== token) return false;
      const unknown = uncertainUserFailure(error);
      setUncertain(unknown);
      setNotice(unknown ? 'No se pudo confirmar la operación. Actualiza la consulta antes de decidir otro intento; no se reenviará automáticamente.' : userFailure(error));
      if (!unknown) { setResult({ revision: -1, data: null, error: '' }); setRevision(value => value + 1); }
      return false;
    } finally {
      if (operation.current === token) { operation.current = null; setBusy(false); }
    }
  }
  return { data, busy, notice, error: result.revision === revision ? result.error : '', loading: result.revision !== revision,
    refresh: () => { if (!operation.current) { setNotice(''); setRevision(value => value + 1); } }, perform };
}
