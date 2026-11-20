import { useEffect, useRef, useState } from 'react';
import { getAdminAccounts, type AdminPage } from './adminAccounts.api';
import { uncertainUserFailure, userFailure } from './usuarios.api';

export function useAdminAccounts() {
  const [query, setQuery] = useState({ page: 1, revision: 0 });
  const [result, setResult] = useState<{ query: typeof query; data?: AdminPage; error?: string }>();
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [notice, setNotice] = useState('');
  const operation = useRef<object | null>(null);
  useEffect(() => () => { operation.current = null; }, []);
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => current ? getAdminAccounts(query.page) : null).then(data => {
      if (current && data) { setResult({ query, data }); setUncertain(false); }
    }).catch((error: unknown) => { if (current) setResult({ query, error: userFailure(error) }); });
    return () => { current = false; };
  }, [query]);
  const data = result?.query === query && !uncertain ? result.data : undefined;
  function refresh(page = query.page) {
    if (!operation.current) setQuery(current => ({ page, revision: current.revision + 1 }));
  }
  async function perform(work: () => Promise<void>) {
    if (operation.current || !data) return false;
    const token = {}; operation.current = token; setBusy(true); setNotice('');
    try {
      await work();
      if (operation.current !== token) return false;
      setNotice('Operación confirmada.'); setQuery(current => ({ ...current, revision: current.revision + 1 }));
      return true;
    } catch (error) {
      if (operation.current !== token) return false;
      const unknown = uncertainUserFailure(error); setUncertain(unknown);
      setNotice(unknown ? 'No se pudo confirmar la operación. Actualiza la consulta antes de decidir otro intento; no se reenviará automáticamente.' : userFailure(error));
      return false;
    } finally { if (operation.current === token) { operation.current = null; setBusy(false); } }
  }
  return { data, busy, notice, perform, refresh, loading: result?.query !== query,
    error: result?.query === query ? result.error : undefined };
}
