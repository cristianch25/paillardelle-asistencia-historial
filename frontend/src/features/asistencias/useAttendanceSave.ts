import { useEffect, useRef, type Dispatch } from 'react';
import { getAttendance, saveAttendance } from './asistencias.api';
import { attendancePatch, assertAttendanceResponse } from './attendanceReconciliation';
import { attendanceFailureStatus, attendanceRejection } from './attendanceSaveError';
import type { AttendanceEditor, EditorAction } from './attendanceEditorState';

export function useAttendanceSave(editor: AttendanceEditor, dispatch: Dispatch<EditorAction>,
  checking: boolean, revalidate: () => Promise<void>) {
  const operation = useRef<object | null>(null);
  useEffect(() => {
    operation.current = null;
    return () => { operation.current = null; };
  }, [editor.epoch]);

  async function denied(status: number | undefined, epoch: object) {
    if (![401, 403, 404].includes(status ?? 0)) return false;
    dispatch({ type: 'phase', epoch, phase: 'denied', message: attendanceRejection(status)! });
    if (status !== 401) await revalidate();
    return true;
  }
  async function consult(snapshot: AttendanceEditor, reason: string, token: object) {
    const { epoch, base } = snapshot;
    if (!base || operation.current !== token) return;
    dispatch({ type: 'phase', epoch, phase: 'refreshing', message: reason });
    try {
      const data = await getAttendance(base.sesion.id);
      if (operation.current !== token) return;
      assertAttendanceResponse(base, data);
      dispatch({ type: 'refreshed', epoch, data, message: data.sesion.estado === 'CERRADA'
        ? 'La sesión fue cerrada. No se pueden guardar nuevas marcas en esta etapa.'
        : 'Lista consultada. Revisa las selecciones antes de volver a guardar. Las coincidencias ya no se enviarán.' });
    } catch (error) {
      if (operation.current !== token || await denied(attendanceFailureStatus(error), epoch)) return;
      dispatch({ type: 'phase', epoch, phase: 'refresh-required',
        message: 'No se pudo consultar el estado actual. Conservamos tus selecciones; consulta antes de volver a guardar.' });
    }
  }
  async function save() {
    if (checking || operation.current || editor.phase !== 'idle' || editor.conflicts.length
      || editor.base?.sesion.estado !== 'ABIERTA') return;
    const body = attendancePatch(editor.base, editor.changes);
    if (!body.cambios.length) return;
    const token = {}; operation.current = token;
    dispatch({ type: 'phase', epoch: editor.epoch, phase: 'saving', message: 'Guardando avances…' });
    try {
      const data = await saveAttendance(editor.base.sesion.id, body);
      if (operation.current !== token) return;
      assertAttendanceResponse(editor.base, data);
      dispatch({ type: 'saved', epoch: editor.epoch, data, message: 'Avances guardados correctamente.' });
    } catch (error) {
      if (operation.current !== token) return;
      const status = attendanceFailureStatus(error);
      if (await denied(status, editor.epoch)) return;
      const rejection = attendanceRejection(status);
      if (rejection) dispatch({ type: 'phase', epoch: editor.epoch, phase: 'idle', message: rejection });
      else await consult(editor, status === 409
        ? 'El servidor no aceptó el guardado. Consultando la lista actual…'
        : 'No se pudo confirmar el guardado. Consultando el estado actual…', token);
    } finally { if (operation.current === token) operation.current = null; }
  }
  async function refresh() {
    if (checking || operation.current || editor.phase !== 'refresh-required') return;
    const token = {}; operation.current = token;
    try { await consult(editor, 'Consultando el estado actual…', token); }
    finally { if (operation.current === token) operation.current = null; }
  }
  return { save, refresh };
}
