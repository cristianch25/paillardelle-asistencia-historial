import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { monthlyReportFixture, monthlyQuery as query } from '../test-support/monthly-report-fixture.js';
import { monthlyQuery, monthlyDays } from '../src/modules/reportes/validation.js';
import { attendanceSymbol } from '../src/modules/reportes/service.js';
import { renderMonthlyPdf } from '../src/modules/reportes/pdf.js';

test('ficha: contrato estricto y meses reales de 28, 29, 30 y 31 días, semanas lunes-domingo', () => {
  for (const [mes, count] of [['2026-02', 28], ['2024-02', 29], ['2026-04', 30], ['2026-03', 31], ['2026-08', 31]]) {
    const data = monthlyQuery({ ...query, mes }), days = monthlyDays(data.desde, data.hasta);
    assert.equal(days.length, count); assert.equal(days[0].numero, 1); assert.equal(days.at(-1).numero, count);
    for (let index = 1; index < count; index++) assert.equal(days[index].semana - days[index - 1].semana, days[index].dia === 'L' ? 1 : 0);
  }
  for (const patch of [{ mes: '2026-13' }, { mes: ['2026-03'] }, { mes: '03' }, { seccion_id: '01' }, { extra: 'x' }]) {
    assert.throws(() => monthlyQuery({ ...query, ...patch }), { status: 400 });
  }
});

test('ficha: símbolos exactos y rechazo de combinaciones incompatibles sin inventar estados', () => {
  for (const [estado, justificada, symbol] of [['PENDIENTE', 0, ''], ['PRESENTE', 0, '.'], ['FALTA', 0, 'F'], ['FALTA', 1, 'J'], ['TARDANZA', 0, 'T'], ['TARDANZA', 1, 'TJ']]) {
    assert.equal(attendanceSymbol({ estado, justificada }), symbol);
  }
  for (const row of [{ estado: 'PRESENTE', justificada: 1 }, { estado: 'PENDIENTE', justificada: 1 }, { estado: 'SIN_MARCAR', justificada: 0 }, { estado: 'FALTA', justificada: '0' }]) assert.throws(() => attendanceSymbol(row));
});

test('ficha: celdas sin registro vacías, PENDIENTE vacío y marcas auténticas en días ahora no lectivos', async () => {
  const { service, state } = monthlyReportFixture();
  state.marks = ['PRESENTE', 'FALTA', 'FALTA', 'TARDANZA', 'TARDANZA', 'PENDIENTE'].map((estado, index) => ({
    estudiante_id: '20', fecha: `2026-03-0${index + 1}`, estado, justificada: [2, 4].includes(index) ? 1 : 0 }));
  const report = await service.monthly(query, state.actor);
  assert.equal(report.section.estado, 'CERRADO'); assert.equal(report.students[0].nombre, 'Muñoz Álvarez Lucía Ficticia');
  assert.deepEqual(report.students[0].marcas.slice(0, 7), ['.', 'F', 'J', 'T', 'TJ', '', '']);
  assert.equal(report.days.every(day => !day.es_lectivo), true);
  state.marks.push({ ...state.marks[0] }); await assert.rejects(service.monthly(query, state.actor), /inconsistente/);
});

test('ficha: ADMIN, SUBDIRECCION por adicionales explícitos, REGISTRADOR asignado y revalidación del actor', async () => {
  for (const [actor, status] of [[null, 401], [{ id: '1', rol: 'ADMIN', activo: 0 }, 401], [{ id: '1', rol: 'PORTERIA', activo: 1 }, 403]]) {
    const f = monthlyReportFixture({ actor }); await assert.rejects(f.service.monthly(query, { id: '1', rol: 'ADMIN' }), { status });
  }
  const sub = monthlyReportFixture({ actor: { id: '1', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' }, levels: [] });
  await assert.rejects(sub.service.monthly(query, sub.state.actor), { status: 404 });
  sub.state.levels = ['PRIMARIA']; await sub.service.monthly(query, sub.state.actor); assert.equal(sub.state.readOnly, true);
  sub.state.section.nivel = 'INICIAL';
  await assert.rejects(sub.service.monthly(query, sub.state.actor), { status: 404 });
  sub.state.levels.push('INICIAL'); await sub.service.monthly(query, sub.state.actor);
  const registrar = monthlyReportFixture({ actor: { id: '1', rol: 'REGISTRADOR', activo: 1 }, assigned: [] });
  await assert.rejects(registrar.service.monthly(query, registrar.state.actor), { status: 404 });
  registrar.state.assigned = ['10']; await registrar.service.monthly(query, registrar.state.actor);
  assert.deepEqual(registrar.state.queries.at(-2), ['assignment', '1', '2026-11-19', '2026-11-19']);
});

test('ficha: mes parcialmente dentro del año, sin estudiantes y límite explícito superior a 30', async () => {
  const f = monthlyReportFixture(); f.state.section.fecha_inicio = '2026-03-15';
  const report = await f.service.monthly(query, f.state.actor); assert.equal(report.days.length, 31);
  assert.equal(f.state.queries.at(-1)[1].desde, '2026-03-15');
  await assert.rejects(f.service.monthly({ ...query, mes: '2026-02' }, f.state.actor), { status: 400 });
  f.state.students = []; await assert.rejects(f.service.monthly(query, f.state.actor), { status: 404 });
  f.state.students = Array.from({ length: 31 }, () => ({})); await assert.rejects(f.service.monthly(query, f.state.actor), { status: 422 });
});

test('PDF real: una página A4, 30 estudiantes, imagen institucional y texto nítido; no recorta nombres', async () => {
  const f = monthlyReportFixture();
  f.state.students = Array.from({ length: 30 }, (_, index) => ({ id: String(index + 20), apellido_paterno: `Estudiante ${index + 1}`, nombres: 'Ficticio' }));
  const report = await f.service.monthly(query, f.state.actor), pdf = await renderMonthlyPdf(report);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const raw = pdf.toString('latin1'); assert.equal((raw.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.match(raw, /\/MediaBox \[0 0 595\.28 841\.89\]/); assert.match(raw, /\/Subtype \/Image/);
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match => {
    try { return [inflateSync(Buffer.from(match[1], 'latin1')).toString()]; } catch { return []; }
  }).join('\n');
  const text = [...streams.matchAll(/\[([^\]]*)\] TJ/g)].map(match => [...match[1].matchAll(/<([\da-f]+)>/gi)].map(part => Buffer.from(part[1], 'hex').toString('latin1')).join('')).join('\n');
  assert.match(text, /REGISTRO DE ASISTENCIA 2026 : MARZO/); assert.match(text, /Estudiante 30 Ficticio/);
  assert.match(text, /TJ Tardanza justificada/); assert.match(text, /SEMANA/);
  for (const mes of ['2026-02', '2024-02', '2026-04']) {
    f.state.section.anio = Number(mes.slice(0, 4));
    f.state.section.fecha_inicio = `${mes.slice(0, 4)}-01-01`; f.state.section.fecha_fin = `${mes.slice(0, 4)}-12-31`;
    const monthly = await f.service.monthly({ ...query, mes }, f.state.actor);
    const rendered = await renderMonthlyPdf(monthly);
    assert.equal((rendered.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 1);
  }
  report.students[0].nombre = 'Nombre '.repeat(80); await assert.rejects(renderMonthlyPdf(report), { status: 422 });
});
