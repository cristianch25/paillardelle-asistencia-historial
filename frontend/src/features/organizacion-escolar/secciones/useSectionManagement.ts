import { useRef, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { createSection, createSectionBatch, updateSection } from './secciones.api';
import type { Section, SectionInput, SectionBatchInput, SectionPatch } from './secciones.types';
import { useUnsavedChanges } from '../../../shared/navigation/useUnsavedChanges';

export function useSectionManagement(onSaved: () => void) {
  const [editor, setEditor] = useState<{ section?: Section; multiple?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Section | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const locked = useRef(false);
  useUnsavedChanges('section-management', false, busy);
  async function perform(action: () => Promise<unknown>, success = 'Sección guardada correctamente.') {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await action(); setEditor(null); setConfirm(null); setMessage(success); onSaved();
    } catch (cause) {
      const status = axios.isAxiosError(cause) ? cause.response?.status : undefined;
      const detail = axios.isAxiosError(cause) && typeof cause.response?.data?.error === 'string' ? cause.response.data.error as string : '';
      setError(status === 409 ? `${detail || 'Conflicto: la sección cambió, está duplicada, el año está cerrado o existen referencias incompatibles.'} Actualiza las secciones antes de reintentar.`
        : `${apiErrorMessage(cause)} Actualiza las secciones para comprobar el resultado antes de reintentar.`);
    } finally { locked.current = false; setBusy(false); }
  }
  function patch(section: Section, cambios: SectionPatch['cambios']) {
    const { grado, letra, activo } = section;
    return updateSection(section.id, { esperado: { grado, letra, activo }, cambios });
  }
  return { editor, confirm, busy, message, error,
    edit: (section?: Section) => { setError(''); setMessage(''); setConfirm(null); setEditor({ section }); },
    createMultiple: () => { setError(''); setMessage(''); setConfirm(null); setEditor({ multiple: true }); },
    askState: (section: Section) => { setError(''); setMessage(''); setEditor(null); setConfirm(section); },
    close: () => { setEditor(null); setConfirm(null); setError(''); },
    save: (input: SectionInput) => perform(() => editor?.section
      ? patch(editor.section, { grado: input.grado, letra: input.letra }) : createSection(input)),
    saveBatch: (input: SectionBatchInput) => perform(() => createSectionBatch(input), 'Secciones creadas correctamente.'),
    saveState: () => confirm ? perform(() => patch(confirm, { activo: !confirm.activo })) : Promise.resolve() };
}
