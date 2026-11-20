import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

async function preparar() {
  const f = studentsFixture();
  f.state.years.get('1').estado = 'ABIERTO';
  f.state.sections.set('14', { ...f.state.sections.get('11'), id: '14', letra: 'B' });
  const { matricula } = await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('1'));
  await f.matriculas.withdraw(matricula.id,
    { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null }, f.actor('1'));
  f.state.attendances.push({ id: '80', matricula_id: matricula.id, fecha: '2026-05-15',
    estado: 'FALTA', justificada: true, motivo_justificacion: 'Cita médica', version: 2 });
  f.state.history = [{ asistencia_id: '80', tipo: 'JUSTIFICACION', version_nueva: 2 }];
  const reingresar = (actorId = '1') => f.matriculas.reingreso(matricula.id,
    { seccion_id: '14', fecha_reingreso: '2026-08-11' }, f.actor(actorId));
  return { f, matricula, reingresar, inicio: f.state.calls.length };
}

function sinEscrituras(f, inicio) {
  assert.equal(f.state.calls.slice(inicio).some(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql)), false);
  assert.deepEqual(f.state.transactions.at(-1).events, ['begin', 'rollback', 'release']);
}

for (const actorId of ['1', '2']) {
  test(`reingreso: actor ${actorId}, orden de bloqueos y conservación histórica`, async () => {
    const { f, matricula, reingresar, inicio } = await preparar();
    const antes = structuredClone(f.state);
    const result = await reingresar(actorId);
    const consultas = f.state.calls.slice(inicio);
    const tablas = ['usuarios', 'anios_escolares', 'secciones', 'estudiantes', 'matriculas'];
    const posiciones = tablas.map(tabla => consultas.findIndex(c =>
      c.sql.includes(`FROM ${tabla} WHERE`) && c.sql.includes('FOR UPDATE')));
    assert.ok(posiciones.every((p, i) => p >= 0 && (i === 0 || p > posiciones[i - 1])));
    const localizador = consultas.findIndex(c => c.sql.startsWith('SELECT estudiante_id, anio_escolar_id FROM matriculas'));
    assert.ok(localizador > posiciones[0] && localizador < posiciones[1]);
    assert.doesNotMatch(consultas[localizador].sql, /FOR UPDATE|FOR SHARE/);
    const vinculos = consultas.findIndex(c => c.sql.includes('FROM matricula_secciones ms'));
    assert.ok(vinculos > posiciones.at(-1));
    assert.match(consultas[vinculos].sql, /FOR UPDATE OF ms$/);
    assert.ok(consultas.findIndex(c => c.sql.includes('FROM sesiones_asistencia')) > vinculos);
    assert.ok(consultas.every(c => c.tx === f.state.transactions.at(-1)));
    assert.equal(f.state.transactions.length, antes.transactions.length + 1);
    assert.deepEqual(f.state.links.slice(0, -1), antes.links);
    assert.deepEqual(f.state.attendances, antes.attendances);
    assert.deepEqual(f.state.history, antes.history);
    assert.equal(result.id, matricula.id);
    assert.equal(result.fecha_reingreso, '2026-08-11');
    assert.equal(f.state.matriculas[0].fecha_ingreso, matricula.fecha_ingreso);
    assert.equal(f.state.audits.length, antes.audits.length + 1);
    assert.equal(f.state.audits.at(-1).accion, 'REINGRESAR_MATRICULA');
    assert.deepEqual(f.state.transactions.at(-1).events, ['begin', 'commit', 'release']);
  });
}

const cambios = [
  ['otro estudiante', f => { f.state.matriculas[0].estudiante_id = '77'; }, 409, /matrícula cambió/],
  ['otro año', f => { f.state.matriculas[0].anio_escolar_id = '2'; }, 409, /matrícula cambió/],
  ['matrícula eliminada', f => { f.state.matriculas = []; }, 404, /no encontrada/],
  ['matrícula ya activa', f => { f.state.matriculas[0].estado = 'ACTIVA'; }, 409, /RETIRADA/],
  ['retiro más reciente', f => { f.state.matriculas[0].fecha_retiro = '2026-08-12'; }, 400, /posterior/],
  ['año cerrado', f => { f.state.years.get('1').estado = 'CERRADO'; }, 409, /ABIERTO/],
  ['destino inactivo', f => { f.state.sections.get('14').activo = 0; }, 409, /inactiva/],
  ['destino de otro año', f => { f.state.sections.get('14').anio_escolar_id = '2'; }, 400, /mismo año/],
];

for (const [nombre, cambiar, status, mensaje] of cambios) {
  test(`reingreso revalida tras localizar: ${nombre}`, async () => {
    const { f, reingresar, inicio } = await preparar();
    const vinculos = structuredClone(f.state.links), auditorias = structuredClone(f.state.audits);
    let cambiado = false;
    f.state.fail = sql => {
      if (!cambiado && sql.includes('FROM anios_escolares WHERE')) {
        cambiado = true;
        cambiar(f);
      }
    };
    await assert.rejects(reingresar(), error => error.status === status && mensaje.test(error.message));
    assert.equal(cambiado, true);
    sinEscrituras(f, inicio);
    assert.deepEqual(f.state.links, vinculos);
    assert.deepEqual(f.state.audits, auditorias);
  });
}

test('dos actores reingresando la misma matrícula: solo uno confirma y audita', async () => {
  const { f, reingresar } = await preparar();
  const antes = structuredClone(f.state);
  const resultados = await Promise.allSettled([reingresar('1'), reingresar('5')]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  const conflicto = resultados.find(r => r.status === 'rejected');
  assert.equal(conflicto.reason.status, 409);
  assert.match(conflicto.reason.message, /RETIRADA/);
  assert.equal(f.state.links.length, antes.links.length + 1);
  assert.deepEqual(f.state.links.slice(0, -1), antes.links);
  assert.equal(f.state.audits.length, antes.audits.length + 1);
  assert.deepEqual(f.state.attendances, antes.attendances);
  assert.deepEqual(f.state.history, antes.history);
});

for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
  test(`reingreso: ${code} responde 409 sin escrituras ni reintentos`, async () => {
    const { f, reingresar, inicio } = await preparar();
    const antes = structuredClone(f.state);
    let intentos = 0;
    f.state.fail = sql => {
      if (sql.includes('FROM anios_escolares WHERE')) {
        intentos++;
        throw Object.assign(new Error('Conflicto simulado'), { code });
      }
    };
    await assert.rejects(reingresar(), { status: 409 });
    assert.equal(intentos, 1);
    sinEscrituras(f, inicio);
    assert.deepEqual(f.state.matriculas, antes.matriculas);
    assert.deepEqual(f.state.links, antes.links);
    assert.deepEqual(f.state.audits, antes.audits);
  });
}
