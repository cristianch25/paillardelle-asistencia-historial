import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, JustifyDialog, DraftModule, AuthContext, StudentProfileContext, AssignedStudentSearch, QuickAttendanceDialog, NavigationProtectionContext, StudentRow;

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  JustifyDialog = (await vite.ssrLoadModule('/src/features/asistencias/AttendanceJustifyDialog.tsx')).default;
  DraftModule = await vite.ssrLoadModule('/src/features/asistencias/attendanceDraft.ts');
  AuthContext = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  StudentProfileContext = (await vite.ssrLoadModule('/src/features/estudiantes/perfil/StudentProfileContext.ts')).StudentProfileContext;
  AssignedStudentSearch = (await vite.ssrLoadModule('/src/features/asistencias/AssignedStudentSearch.tsx')).default;
  QuickAttendanceDialog = (await vite.ssrLoadModule('/src/features/asistencias/QuickAttendanceDialog.tsx')).default;
  NavigationProtectionContext = (await vite.ssrLoadModule('/src/shared/navigation/NavigationProtectionContext.ts')).NavigationProtectionContext;
  StudentRow = (await vite.ssrLoadModule('/src/features/asistencias/AttendanceStudentRow.tsx')).default;
});

after(async () => {
  await vite?.close();
});

test('AttendanceJustifyDialog: no renderiza nada si isOpen es false', () => {
  const html = renderToStaticMarkup(
    h(JustifyDialog, {
      isOpen: false,
      state: 'TARDANZA',
      studentName: 'Ana María Pérez',
      onSave: () => {},
      onCancel: () => {},
    })
  );
  assert.equal(html, '');
});

test('AttendanceJustifyDialog: renderiza título, nombre del estudiante y campos cuando isOpen es true', () => {
  const html = renderToStaticMarkup(
    h(JustifyDialog, {
      isOpen: true,
      initialReason: 'Cita médica',
      state: 'TARDANZA',
      studentName: 'Ana María Pérez',
      onSave: () => {},
      onCancel: () => {},
    })
  );
  assert.match(html, /Justificar tardanza/);
  assert.match(html, /Ana María Pérez/);
  assert.match(html, /Motivo de la justificación/);
  assert.match(html, /Cita médica/);
  assert.match(html, /Aceptar motivo/);
  assert.match(html, /Cancelar/);
});

test('attendanceDraft justification validation: valida longitud y motivo obligatorio al justificar', () => {
  assert.equal(DraftModule.justificationError(''), 'Escribe un motivo válido de hasta 500 caracteres.');
  assert.equal(DraftModule.justificationError('   '), 'Escribe un motivo válido de hasta 500 caracteres.');
  assert.equal(DraftModule.justificationError('Motivo válido'), '');
  assert.equal(DraftModule.justificationError('a'.repeat(500)), '');
  assert.equal(DraftModule.justificationError('a'.repeat(501)), 'Escribe un motivo válido de hasta 500 caracteres.');
});

test('attendanceEditorReducer: gestiona justificaciones para FALTA y TARDANZA y protege persistidas', async () => {
  const { attendanceEditorReducer, createAttendanceEditor } = await vite.ssrLoadModule('/src/features/asistencias/attendanceEditorState.ts');
  const baseData = {
    sesion: { id: 's1', version: 1, seccion_id: 'sec1', anio_escolar_id: 'y1', fecha: '2026-11-20', estado: 'ABIERTA' },
    padron: [
      { asistencia_id: '1', matricula_id: 'm1', estado: 'PENDIENTE', version: 0, justificada: false, motivo_justificacion: null },
      { asistencia_id: '2', matricula_id: 'm2', estado: 'FALTA', version: 1, justificada: true, motivo_justificacion: 'Descanso médico' },
    ],
    resumen: { total: 2, presentes: 0, tardanzas: 0, faltas: 1, pendientes: 1 },
  };

  let state = createAttendanceEditor('acc1', baseData);

  // Intentar justificar fila en PENDIENTE sin cambiar estado: ignorado (debe ser FALTA o TARDANZA)
  state = attendanceEditorReducer(state, { type: 'justify', id: '1', reason: 'Motivo' });
  assert.equal(state.reasons['1'], undefined);

  // Cambiar fila 1 a FALTA y justificar
  state = attendanceEditorReducer(state, { type: 'select', id: '1', state: 'FALTA' });
  assert.equal(state.changes['1'], 'FALTA');
  state = attendanceEditorReducer(state, { type: 'justify', id: '1', reason: 'Cita médica' });
  assert.equal(state.reasons['1'], 'Cita médica');

  // Si se cambia de nuevo a PRESENTE, la justificación se remueve automáticamente
  state = attendanceEditorReducer(state, { type: 'select', id: '1', state: 'PRESENTE' });
  assert.equal(state.changes['1'], 'PRESENTE');
  assert.equal(state.reasons['1'], undefined);

  // Volver a TARDANZA y justificar
  state = attendanceEditorReducer(state, { type: 'select', id: '1', state: 'TARDANZA' });
  state = attendanceEditorReducer(state, { type: 'justify', id: '1', reason: 'Tráfico' });
  assert.equal(state.reasons['1'], 'Tráfico');

  // Quitar justificación con undefined
  state = attendanceEditorReducer(state, { type: 'justify', id: '1', reason: undefined });
  assert.equal(state.reasons['1'], undefined);

  // Fila 2 ya está persistida como justificada: no permite modificar su justificación
  state = attendanceEditorReducer(state, { type: 'justify', id: '2', reason: 'Nuevo motivo' });
  assert.equal(state.reasons['2'], undefined);
});

test('AssignedStudentSearch: renderiza formulario de búsqueda y fecha', () => {
  const html = renderToStaticMarkup(
    h(AuthContext.Provider, { value: { session: { user: { id: 'reg1', rol: 'REGISTRADOR' } } } },
      h(StudentProfileContext.Provider, { value: () => {} },
        h(AssignedStudentSearch, {
          years: [{ id: 'y1', anio: 2026, estado: 'ABIERTO', fecha_inicio: '2026-03-01', fecha_fin: '2026-12-31' }],
          date: '2026-11-20',
          onDateChange: () => {},
          onSaved: () => {},
        })
      )
    )
  );
  assert.match(html, /Buscar entre mis estudiantes/);
  assert.match(html, /Fecha de asistencia/);
  assert.match(html, /Buscar estudiante/);
});

test('QuickAttendanceDialog: renderiza nombre del estudiante enlazado al perfil', () => {
  const student = {
    selection: {
      year: { id: 'y1', anio: 2026, estado: 'ABIERTO', fecha_inicio: '2026-03-01', fecha_fin: '2026-12-31' },
      section: { id: 'sec1', anio_escolar_id: 'y1', nivel: 'PRIMARIA', grado: 1, letra: 'A', turno: 'MANANA' },
    },
    row: {
      id: 'm1',
      matricula_id: 'm1',
      matricula_seccion_id: 'ms1',
      seccion_id: 'sec1',
      anio_escolar_id: 'y1',
      estado: 'ACTIVA',
      estudiante: { id: 'e1', apellido_paterno: 'Pérez', apellido_materno: 'Ríos', nombres: 'Ana María', codigo_estudiante: null },
    },
  };

  const navContext = {
    register: () => () => {},
    request: async cb => cb(),
  };

  const html = renderToStaticMarkup(
    h(AuthContext.Provider, { value: { session: { user: { id: 'reg1', rol: 'REGISTRADOR' } } } },
      h(NavigationProtectionContext.Provider, { value: navContext },
        h(StudentProfileContext.Provider, { value: () => {} },
          h(QuickAttendanceDialog, {
            student,
            date: '2026-11-20',
            onClose: () => {},
            onSaved: () => {},
          })
        )
      )
    )
  );

  assert.match(html, /Asistencia del estudiante/);
  assert.match(html, /Pérez Ríos Ana María/);
  assert.match(html, /title="Ver perfil del estudiante y teléfono del apoderado"/);
});

test('V8 RN-08: estudiante con justificación persistida bloquea cambio de estado en UI y en borrador', () => {
  const rowUnjustified = {
    asistencia_id: 'a1',
    matricula_id: 'm1',
    matricula_seccion_id: 'ms1',
    seccion_id: 'sec1',
    anio_escolar_id: 'y1',
    fecha: '2026-11-20',
    estado: 'FALTA',
    version: 1,
    justificada: false,
    motivo_justificacion: null,
    estudiante: { id: 'e1', apellido_paterno: 'Pérez', apellido_materno: 'Ríos', nombres: 'Ana', codigo_estudiante: null },
  };

  const rowJustified = {
    ...rowUnjustified,
    asistencia_id: 'a2',
    justificada: true,
    motivo_justificacion: 'Cita médica',
  };

  // 1. selectAttendanceState: asistencia no justificada permite cambiar estado
  const changesUnjustified = DraftModule.selectAttendanceState([rowUnjustified], {}, 'a1', 'TARDANZA');
  assert.equal(changesUnjustified['a1'], 'TARDANZA');

  // 2. selectAttendanceState: asistencia persistida justificada ignora y bloquea cambio de estado
  const changesJustified = DraftModule.selectAttendanceState([rowJustified], {}, 'a2', 'PRESENTE');
  assert.deepEqual(changesJustified, {}, 'No debe admitir cambios de estado para una asistencia justificada');

  // 3. UI AttendanceStudentRow: fila normal tiene botones habilitados
  const htmlUnjustified = renderToStaticMarkup(
    h(StudentRow, {
      row: rowUnjustified,
      state: 'FALTA',
      changed: false,
      editable: true,
      disabled: false,
    })
  );
  assert.match(htmlUnjustified, /aria-pressed="true"/);
  assert.doesNotMatch(htmlUnjustified, /disabled="" aria-pressed="true"/);

  // 4. UI AttendanceStudentRow: fila justificada tiene botones deshabilitados (disabled) y motivo de solo lectura
  const htmlJustified = renderToStaticMarkup(
    h(StudentRow, {
      row: rowJustified,
      state: 'FALTA',
      changed: false,
      editable: true,
      disabled: false,
    })
  );
  assert.match(htmlJustified, /disabled="" aria-pressed="true"/);
  assert.match(htmlJustified, /Cita médica/);
  assert.match(htmlJustified, /Justificación guardada\. Estado y motivo de solo lectura\./);
});
