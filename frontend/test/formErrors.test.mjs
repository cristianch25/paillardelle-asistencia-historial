import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let vite, errors, matriculas, auth, http;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  errors = await vite.ssrLoadModule('/src/shared/api/apiError.ts');
  matriculas = await vite.ssrLoadModule('/src/features/matriculas/matriculas.api.ts');
  auth = await vite.ssrLoadModule('/src/features/auth/auth.api.ts');
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });

const fallo = (status, data) => ({ isAxiosError: true, response: { status, data } });
for (const [status, mensaje] of [
  [400, 'Contraseña actual incorrecta.'],
  [400, 'La fecha de retiro no puede ser futura.'],
  [409, 'La matrícula cambió. Actualiza la consulta antes de continuar.'],
  [409, 'La sección de destino tiene sesiones de asistencia desde la fecha efectiva indicada.'],
]) {
  test(`mensaje de negocio ${status}: ${mensaje}`, () => {
    assert.deepEqual(errors.errorEscritura(fallo(status, { error: mensaje })), { mensaje, incierto: false });
  });
}

for (const status of [401, 403, 404, 413]) {
  test(`rechazo ${status}: explicación segura sin mostrar el cuerpo técnico`, () => {
    const result = errors.errorEscritura(fallo(status, { error: 'SECRETO_FICTICIO' }));
    assert.equal(result.incierto, false);
    assert.doesNotMatch(result.mensaje, /SECRETO_FICTICIO|Intenta nuevamente/);
    if (status === 403) assert.match(result.mensaje, /No tienes permiso/);
  });
}

for (const data of [null, [], '<html>SECRETO_FICTICIO</html>', { message: 'SECRETO_FICTICIO' },
  { error: { sql: 'SECRETO_FICTICIO' } }, { error: '' }, { error: '<html>SECRETO_FICTICIO</html>' },
  { error: 'Error\nSECRETO_FICTICIO' }, { error: 'X'.repeat(501) }]) {
  test(`respuesta de negocio inesperada ${JSON.stringify(data).slice(0, 55)}`, () => {
    const result = errors.errorEscritura(fallo(400, data));
    assert.equal(result.incierto, false);
    assert.equal(result.mensaje, 'No se pudo realizar la operación. Revisa los datos indicados.');
  });
}

for (const [nombre, error] of [
  ['red', { isAxiosError: true }],
  ['timeout', { isAxiosError: true, code: 'ECONNABORTED' }],
  ['cancelación', { isAxiosError: true, code: 'ERR_CANCELED' }],
  ['error 500', fallo(500, { error: 'SECRETO_FICTICIO' })],
  ['proxy 502', fallo(502, '<html>SECRETO_FICTICIO</html>')],
  ['error inesperado', new Error('SECRETO_FICTICIO')],
]) {
  test(`resultado incierto por ${nombre}: no expone detalles ni recomienda repetir`, () => {
    const result = errors.errorEscritura(error);
    assert.equal(result.incierto, true);
    assert.match(result.mensaje, /No se pudo confirmar.*Comprueba el estado/);
    assert.doesNotMatch(result.mensaje, /SECRETO_FICTICIO|Intenta nuevamente|reintenta/i);
  });
}

const operaciones = [
  ['retiro', 'patch', () => matriculas.withdrawEnrollment('1', '2026-05-20')],
  ['cambio de sección', 'post', () => matriculas.changeStudentSection('1', '14', '2026-05-20')],
  ['reingreso', 'post', () => matriculas.reingresoStudent('1', '14', '2026-05-20')],
  ['contraseña', 'post', () => auth.changePassword({ password_actual: 'Ficticia1',
    password_nueva: 'Ficticia2', password_confirmacion: 'Ficticia2' })],
];
for (const [nombre, metodo, ejecutar] of operaciones) {
  test(`${nombre}: respuesta exitosa sin confirmación válida se trata como incierta`, async () => {
    const original = http[metodo];
    let llamadas = 0;
    try {
      for (const data of [undefined, null, '<html>SECRETO_FICTICIO</html>', {}, { id: 'otro', estado: 'ACTIVA' }]) {
        http[metodo] = async () => { llamadas++; return { status: 200, data }; };
        await assert.rejects(ejecutar(), error => errors.errorEscritura(error).incierto);
      }
      assert.equal(llamadas, 5);
    } finally { http[metodo] = original; }
  });
}
