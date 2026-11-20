import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, api, HistoryButton, HistoryDialog, StudentRow, AuthContext;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/asistencias/historial/attendanceHistory.api.ts');
  HistoryButton = (await vite.ssrLoadModule('/src/features/asistencias/historial/AttendanceHistoryButton.tsx')).default;
  HistoryDialog = (await vite.ssrLoadModule('/src/features/asistencias/historial/AttendanceHistoryDialog.tsx')).default;
  StudentRow = (await vite.ssrLoadModule('/src/features/asistencias/AttendanceStudentRow.tsx')).default;
  AuthContext = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
});

after(async () => {
  await vite?.close();
});

test('API getAttendanceHistory llama a GET /asistencias/:asistenciaId/historial', async () => {
  const http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  let capturedUrl = '';
  const originalGet = http.httpClient.get;
  http.httpClient.get = async url => {
    capturedUrl = url;
    return { data: { asistencia_id: '123', cambios: [] } };
  };
  try {
    const res = await api.getAttendanceHistory('123');
    assert.equal(capturedUrl, '/asistencias/123/historial');
    assert.equal(res.asistencia_id, '123');
    assert.deepEqual(res.cambios, []);
  } finally {
    http.httpClient.get = originalGet;
  }
});

test('AttendanceHistoryButton: oculto para REGISTRADOR y roles no autorizados', () => {
  const regSession = { session: { user: { id: '3', rol: 'REGISTRADOR' } } };
  const htmlReg = renderToStaticMarkup(
    h(AuthContext.Provider, { value: regSession }, h(HistoryButton, { asistenciaId: '100', version: 1 }))
  );
  assert.equal(htmlReg, '', 'REGISTRADOR no debe ver el botón de historial');

  const htmlNoAuth = renderToStaticMarkup(
    h(AuthContext.Provider, { value: null }, h(HistoryButton, { asistenciaId: '100', version: 1 }))
  );
  assert.equal(htmlNoAuth, '', 'Sin autenticación no debe mostrar botón');
});

test('AttendanceHistoryButton: deshabilitado con versión 0 y habilitado con versión > 0 para ADMIN y SUBDIRECCION', () => {
  const adminSession = { session: { user: { id: '1', rol: 'ADMIN' } } };
  const subdirSession = { session: { user: { id: '2', rol: 'SUBDIRECCION' } } };

  // Versión 0 (sin modificar): botón deshabilitado con título indicativo
  const htmlAdminV0 = renderToStaticMarkup(
    h(AuthContext.Provider, { value: adminSession }, h(HistoryButton, { asistenciaId: '100', version: 0 }))
  );
  assert.match(htmlAdminV0, /disabled=""/);
  assert.match(htmlAdminV0, /title="Sin historial disponible"/);
  assert.match(htmlAdminV0, /Historial/);

  // Versión 1 (modificado): botón habilitado para SUBDIRECCION
  const htmlSubdirV1 = renderToStaticMarkup(
    h(AuthContext.Provider, { value: subdirSession }, h(HistoryButton, { asistenciaId: '100', version: 1 }))
  );
  assert.doesNotMatch(htmlSubdirV1, /disabled=""/);
  assert.match(htmlSubdirV1, /title="Ver historial de modificaciones"/);
  assert.match(htmlSubdirV1, /Historial/);
});

test('AttendanceStudentRow: integra botón de historial para ADMIN y lo omite en modal rápido', () => {
  const adminSession = { session: { user: { id: '1', rol: 'ADMIN' } } };
  const sampleRow = {
    asistencia_id: '150',
    matricula_id: '10',
    matricula_seccion_id: '5',
    estado: 'PRESENTE',
    version: 2,
    justificada: false,
    estudiante: {
      id: '20',
      codigo_estudiante: 'EST999',
      apellido_paterno: 'García',
      apellido_materno: 'López',
      nombres: 'María',
    },
  };

  // Render ordinario: incluye botón Historial
  const htmlNormal = renderToStaticMarkup(
    h(AuthContext.Provider, { value: adminSession },
      h(StudentRow, {
        row: sampleRow,
        state: 'PRESENTE',
        changed: false,
        editable: false,
      })
    )
  );
  assert.match(htmlNormal, /Historial/);
  assert.match(htmlNormal, /García López María/);

  // Render rápido (quick=true): omite botón Historial
  const htmlQuick = renderToStaticMarkup(
    h(AuthContext.Provider, { value: adminSession },
      h(StudentRow, {
        row: sampleRow,
        state: 'PRESENTE',
        changed: false,
        editable: true,
        quick: true,
      })
    )
  );
  assert.doesNotMatch(htmlQuick, /Historial/);
});

test('AttendanceHistoryDialog: renderiza estructura base de diálogo y botón cerrar', () => {
  const html = renderToStaticMarkup(h(HistoryDialog, { asistenciaId: '100', onClose: () => {} }));
  assert.match(html, /<dialog/);
  assert.match(html, /Historial de modificaciones de asistencia/);
  assert.match(html, /Cerrar/);
});
