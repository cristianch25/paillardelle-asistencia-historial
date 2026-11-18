import { useEffect, useRef, useState } from 'react';
import { importErrorMessage } from './importPresentation';
import { loadPreview, readPreview, selectPreviewRows, correctPreviewPhone } from './import.api';
import type { ImportPreview, ImportSelection } from './import.types';

export function useImportPreview() {
  const [data, setData] = useState<ImportPreview | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [expired, setExpired] = useState(false);
  const running = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(data.caduca_en) - Date.now()));
    return () => clearTimeout(timer);
  }, [data]);
  async function run(work: () => Promise<ImportPreview>, keepData = false) {
    if (running.current) return false;
    running.current = true; setBusy(true); setError('');
    try { const next = await work(); if (alive.current) { setData(next); setExpired(Date.parse(next.caduca_en) <= Date.now()); } return true; }
    catch (failure) { if (alive.current) { if (!keepData) setData(null); setError(importErrorMessage(failure)); } return false; }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return { data, error, busy, expired,
    clear: () => { if (!running.current) { setData(null); setError(''); setExpired(false); } },
    load: (file: File, selection: ImportSelection) => run(() => loadPreview(file, selection)),
    page: (page: number) => data && run(() => readPreview(data.id, page)),
    correctPhone: (rowId: string, phone: string | null, version: number) => data
      ? run(() => correctPreviewPhone(data.id, rowId, phone, version), true) : Promise.resolve(false),
    toggle: (id: string, checked: boolean) => data && run(async () => {
      const selected = checked ? [...data.filas_seleccionadas, id] : data.filas_seleccionadas.filter(key => key !== id);
      await selectPreviewRows(data.id, selected);
      return readPreview(data.id, data.pagination.page);
    }),
  };
}
