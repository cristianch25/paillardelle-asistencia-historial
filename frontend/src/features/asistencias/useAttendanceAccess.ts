import { useEffect, useRef, useState } from 'react';
import type { AttendanceEditor } from './attendanceEditorState';

// Una comprobación de sección no acredita el acceso a la fecha de la sesión histórica.
export function useAttendanceAccess(editor: AttendanceEditor, checking: boolean, validate: () => Promise<void>) {
  const [revision, setRevision] = useState(0);
  const consumed = useRef(0), requested = useRef<object | null>(null);
  useEffect(() => {
    const onFocus = () => {
      // Una operación en curso ya comprueba el acceso; no superponer otro GET.
      if (!editor.base || editor.phase !== 'idle') return;
      requested.current = editor.epoch;
      setRevision(value => value + 1);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [editor.base, editor.epoch, editor.phase]);
  useEffect(() => {
    if (consumed.current === revision) return;
    if (requested.current !== editor.epoch || !editor.base) { consumed.current = revision; return; }
    if (checking || editor.phase !== 'idle') return;
    consumed.current = revision;
    void validate();
  }, [revision, checking, editor.epoch, editor.base, editor.phase, validate]);
}
