import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const escenario = String.raw`
import assert from 'node:assert/strict';
import Packet from './node_modules/mysql2/lib/packets/packet.js';
import Types from './node_modules/mysql2/lib/constants/types.js';
import ConnectionConfig from './node_modules/mysql2/lib/connection_config.js';
import { readDatabaseConfig } from './src/config/database.js';
import { createAttendanceHistoryRepository } from './src/modules/asistencias/history.repository.js';
import { createAttendanceWriter } from './src/modules/asistencias/write.repository.js';

const options = readDatabaseConfig({ DB_HOST: '127.0.0.1', DB_PORT: '3311', DB_USER: 'ficticio',
  DB_PASSWORD: 'ficticia', DB_NAME: 'asistencia_paillardelle' });
const config = new ConnectionConfig(options);
assert.equal(config.dateStrings, true);
assert.equal(config.timezone, 'local');

// Paquetes binarios simulados, decodificados por el mysql2 instalado; sin conexión.
function leerFecha(hora) {
  const buffer = Buffer.alloc(hora ? 16 : 9);
  buffer[4] = hora ? 11 : 4;
  buffer.writeUInt16LE(2026, 5); buffer[7] = 11; buffer[8] = 20;
  if (hora) {
    buffer[9] = 18; buffer[10] = 30; buffer[11] = 45;
    buffer.writeUInt32LE(123456, 12);
  }
  const packet = new Packet(0, buffer, 0, buffer.length);
  return packet.readDateTimeString(hora ? 6 : 0, null, hora ? Types.DATETIME : Types.DATE);
}
const fechaCivil = leerFecha(false), fechaMysql = leerFecha(true);
assert.equal(fechaCivil, '2026-11-20');
assert.equal(fechaMysql, '2026-11-20 18:30:45.123456');
const instantes = ['2026-11-20 03:59:59.999999', '2026-11-20 05:00:00', fechaMysql];
const rows = instantes.map((fecha_modificacion, index) => ({ id: String(index + 1), asistencia_id: '1',
  fecha_modificacion, version_anterior: index, version_nueva: index + 1, usuario_id: '2' }));
const antes = structuredClone(rows), consultas = [];
const repository = createAttendanceHistoryRepository(() => { throw new Error('No se permite abrir conexiones'); });
const connection = { async execute(sql, params) {
  consultas.push(sql);
  assert.match(sql.trim(), /^SELECT/);
  assert.deepEqual(params, ['1']);
  return sql.includes('FROM historial_asistencias') ? [rows]
    : [[{ asistencia_id: '1', sesion_id: '3', fecha: fechaCivil, estudiante_id: '4', seccion_id: '5' }]];
} };
const historial = await repository.findHistory(connection, '1');
assert.deepEqual(historial.map(row => row.fecha_modificacion), [
  '2026-11-20T03:59:59.999Z', '2026-11-20T05:00:00.000Z', '2026-11-20T18:30:45.123Z']);
assert.match(consultas[0], /ORDER BY h.version_nueva ASC, h.fecha_modificacion ASC/);
assert.ok(historial.every((row, index) => index === 0
  || Date.parse(row.fecha_modificacion) >= Date.parse(historial[index - 1].fecha_modificacion)));
assert.deepEqual(rows, antes);
assert.equal((await repository.findContext(connection, '1')).fecha, fechaCivil);

for (const valor of [new Date('2026-11-20T18:30:45.123Z'), '2026-11-20T18:30:45.123Z',
  '2026-11-20T13:30:45.123-05:00']) {
  const result = await repository.findHistory({ async execute() { return [[{ ...rows[0], fecha_modificacion: valor }]]; } }, '1');
  assert.equal(result[0].fecha_modificacion, '2026-11-20T18:30:45.123Z');
}
const parts = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  .formatToParts(new Date(historial[2].fecha_modificacion));
assert.equal(parts.find(p => p.type === 'hour').value, '13');
assert.equal(parts.find(p => p.type === 'minute').value, '30');
assert.equal(parts.find(p => p.type === 'second').value, '45');

const writes = [];
await createAttendanceWriter().mark({ async execute(sql) { writes.push(sql); return [{ affectedRows: 1 }]; } },
  { before: { id: '1', estado: 'PENDIENTE', version: 0, justificada: false }, estado: 'PRESENTE',
    justificada: false, motivo_justificacion: null, tipo: 'PRIMERA_MARCA', posterior_cierre: false, motivo: null }, '2');
assert.match(writes[1], /INSERT INTO historial_asistencias[\s\S]*UTC_TIMESTAMP\(6\)/);
`;

for (const timezone of ['UTC', 'America/Lima']) {
  test(`historial: driver, interpretación UTC, fecha civil y orden con Node en ${timezone}`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '--eval', escenario], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, TZ: timezone }, encoding: 'utf8', timeout: 15000,
    }));
  });
}
