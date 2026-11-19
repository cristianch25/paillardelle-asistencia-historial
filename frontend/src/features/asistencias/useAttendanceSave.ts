import { useEffect, useRef, type Dispatch } from 'react';
import { getAttendance, openAttendance, saveAttendance } from './asistencias.api';
import { attendancePatch, assertAttendanceResponse, assertAttendanceSaved, reconcileAttendance } from './attendanceReconciliation';
import { getAttendanceWorkspace } from './attendanceWorkspace';
import { attendanceFailureStatus, attendanceRejection } from './attendanceSaveError';
import type { AttendanceEditor, EditorAction } from './attendanceEditorState';

export function useAttendanceSave(editor: AttendanceEditor, dispatch: Dispatch<EditorAction>,
  checking: boolean, revalidate: () => Promise<void>) {
  const operation = useRef<object | null>(null);
  const intent = useRef<'save' | 'access'>('save');
  useEffect(() => {
    operation.current = null;
    return () => { operation.current = null; };
  }, [editor.epoch]);

  async function denied(status: number | undefined, epoch: object) {
    if (![401, 403, 404].includes(status ?? 0)) return false;
    dispatch({ type: 'phase', epoch, phase: 'denied', message: attendanceRejection(status)! });
    if (status !== 401 && intent.current !== 'access') await revalidate();
    return true;
  }
  async function consult(snapshot: AttendanceEditor, reason: string, token: object) {
    const { epoch, base } = snapshot;
    if (!base || operation.current !== token) return;
    dispatch({ type: 'phase', epoch, phase: intent.current === 'access' ? 'checking-access' : 'refreshing', message: reason });
    try {
      const data = base.sesion.id ? await getAttendance(base.sesion.id)
        : await getAttendanceWorkspace(base.sesion.anio_escolar_id, base.sesion.seccion_id, base.sesion.fecha);
      if (operation.current !== token) return;
      assertAttendanceResponse(base, data);
      dispatch({ type: 'refreshed', epoch, data, message: intent.current === 'access'
        ? 'Acceso a la sesión comprobado. Las selecciones compatibles se conservan; revisa las diferencias si existen.'
        : 'Lista consultada. Revisa las selecciones antes de volver a guardar. Las coincidencias ya no se enviarán.' });
    } catch (error) {
      if (operation.current !== token || await denied(attendanceFailureStatus(error), epoch)) return;
      dispatch({ type: 'phase', epoch, phase: 'refresh-required',
        message: intent.current === 'access' ? 'No se pudo comprobar el acceso a la sesión. Conservamos tus selecciones sin guardar; consulta el estado actual para continuar.'
          : 'No se pudo consultar el estado actual. Conservamos tus selecciones; consulta antes de volver a guardar.' });
    }
  }
  async function save() {
    if (checking || operation.current || editor.phase !== 'idle' || editor.conflicts.length
      || !editor.base) return;
    let body;
    try { body = attendancePatch(editor.base, editor.changes, editor.reasons); }
    catch (error) {
      dispatch({ type: 'phase', epoch: editor.epoch, phase: 'idle', message: (error as Error).message });
      return;
    }
    if (!body.cambios.length) return;
    const token = {}; operation.current = token; intent.current = 'save';
    dispatch({ type: 'phase', epoch: editor.epoch, phase: 'saving', message: 'Guardando cambios…' });
    try {
      let base = editor.base;
      if (!base.sesion.id) {
        const opened = await openAttendance(base.sesion.seccion_id, base.sesion.fecha);
        if (operation.current !== token) return;
        const aligned = reconcileAttendance(base, editor.changes, opened, editor.reasons);
        dispatch({ type: 'refreshed', epoch: editor.epoch, data: opened, message: 'Revisa las marcas recuperadas antes de continuar.' });
        if (aligned.conflicts.length) return;
        base = opened; body = attendancePatch(base, aligned.changes, aligned.reasons);
        if (!body.cambios.length) {
          dispatch({ type: 'saved', epoch: editor.epoch, data: opened, message: 'Las marcas ya estaban registradas.' }); return;
        }
        dispatch({ type: 'phase', epoch: editor.epoch, phase: 'saving', message: 'Guardando cambios…' });
      }
      const data = await saveAttendance(base.sesion.id, body);
      if (operation.current !== token) return;
      assertAttendanceSaved(base, data, body);
      dispatch({ type: 'saved', epoch: editor.epoch, data, message: 'Cambios guardados correctamente.' });
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
  async function validateAccess() {
    if (checking || operation.current || editor.phase !== 'idle' || !editor.base) return;
    const token = {}; operation.current = token; intent.current = 'access';
    try { await consult(editor, 'Comprobando acceso a la sesión…', token); }
    finally { if (operation.current === token) operation.current = null; }
  }
  return { save, refresh, validateAccess };
}
