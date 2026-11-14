import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractStudents, extractStudentRows } from '../src/modules/importaciones/student-extraction.js';
import { readXlsx } from '../src/modules/importaciones/xlsx-reader.js';
import { HttpError } from '../src/shared/http-error.js';
import { makePadron, padronParts } from '../test-support/importaciones/padron-fixture.js';
import { makeZip } from '../test-support/importaciones/zip-fixture.js';

const safeError = (status = 400) => error => {
  assert.ok(error instanceof HttpError); assert.equal(error.status, status);
  assert.doesNotMatch(error.message, /Ficticio|Ejemplo|999555666|000000000001|\.xml|SELECT|saxen/i);
  return true;
};

for (const level of ['INICIAL', 'PRIMARIA', 'SECUNDARIA']) test(`mismo formato compartido: ${level}`, async () => {
  const result = await extractStudents(await makePadron({ level }));
  assert.equal(result.registros.length, 1); assert.deepEqual(result.observaciones, []);
  const record = result.registros[0];
  assert.deepEqual(record.estudiante, { codigo_estudiante: '000000000001', tipo_documento: 'DNI',
    numero_documento: '00000001', apellido_paterno: 'Ficticio', apellido_materno: 'Ejemplo',
    nombres: 'Estudiante de prueba', estado_matricula: 'MATRICULADO' });
  assert.deepEqual(record.apoderado, { nombres_apellidos: 'Apoderado ficticio', tipo_documento: 'DNI',
    numero_documento: '00999999', parentesco: 'TUTOR', telefonos_originales: '999555666' });
  assert.deepEqual(record.contexto, { anio: '2027', nivel: level, grado_edad: level === 'INICIAL' ? '4 AÑOS' : '1', seccion: 'A' });
  assert.equal(record.origen.fila, 13);
  assert.equal(record.origen.campos['estudiante.codigo_estudiante'].coordenada, 'H13');
  assert.equal(record.origen.campos['apoderado.numero_documento'].coordenada, 'AW13');
  assert.equal(record.origen.campos['contexto.grado_edad'].coordenada, 'C13');
  assert.equal(record.origen.contexto.anio.sources[0].coordenada, 'Q3');
  assert.equal(record.origen.contexto.nivel.sources[0].coordenada, 'U8');
  assert.deepEqual(record.observaciones, []);
  assert.doesNotMatch(JSON.stringify(result), /Padre ficticio excluido|Madre ficticia excluida|999111222|999333444/);
});

test('descubre campos por encabezados dentro del bloque, no por columna individual fija', async () => {
  const result = await extractStudents(await makePadron({
    fieldOverrides: { H: 'APELLIDO PATERNO', I: 'CÓDIGO DEL ESTUDIANTE' },
    records: [{ values: { H: 'Apellido ficticio', I: '0000009' } }],
  }));
  assert.equal(result.registros[0].estudiante.codigo_estudiante, '0000009');
  assert.equal(result.registros[0].estudiante.apellido_paterno, 'Apellido ficticio');
  assert.equal(result.registros[0].origen.campos['estudiante.codigo_estudiante'].coordenada, 'I13');
});

test('encabezados con saltos, espacios y acentos equivalentes', async () => {
  const result = await extractStudents(await makePadron({ fieldOverrides: {
    H: '  CÓDIGO  DEL\nESTUDIANTE ', F: 'NÙMERO DE DOCUMENTO', AZ: ' NÚMERO\nCELULAR ',
  }, groupOverrides: { AS: ' APODERADO ' } }));
  assert.equal(result.registros[0].estudiante.codigo_estudiante, '000000000001');
});

test('apoderado vacío nunca utiliza PADRE ni MADRE como sustitutos', async () => {
  const result = await extractStudents(await makePadron({ records: [{ values: {
    AS: null, AU: null, AV: null, AW: null, AZ: null,
  } }] }));
  assert.ok(Object.values(result.registros[0].apoderado).every(value => value === null));
  assert.doesNotMatch(JSON.stringify(result), /Padre ficticio excluido|Madre ficticia excluida/);
});

for (const phone of [null, '', '  ', '+51 999555666 / 999777888', 'llamar: dato ficticio']) {
  test('teléfonos originales intactos, sin elegir ni normalizar', async () => {
    const result = await extractStudents(await makePadron({ records: [{ values: { AZ: phone } }] }));
    assert.equal(result.registros[0].apoderado.telefonos_originales, phone === '' ? null : phone);
  });
}

test('datos incompletos se conservan como candidatos y observaciones trazables', async () => {
  const result = await extractStudents(await makePadron({ records: [{ values: { H: null, F: null, K: null, AW: null } }] }));
  const record = result.registros[0];
  assert.equal(record.estudiante.codigo_estudiante, null); assert.equal(record.estudiante.numero_documento, null);
  assert.ok(record.observaciones.some(item => item.codigo === 'IDENTIFICACION_ESTUDIANTE_INCOMPLETA'));
  const missing = record.observaciones.find(item => item.codigo === 'NOMBRES_ESTUDIANTE_AUSENTES');
  assert.equal(missing.origen.hoja, 'rptPadresFamiliaEstudiantes');
  assert.equal(missing.origen.fila, 13); assert.deepEqual(missing.origen.coordenadas, ['K13']);
  assert.ok(record.observaciones.some(item => item.codigo === 'DOCUMENTO_INCOMPLETO' && item.campo === 'apoderado'));
});

test('TRASLADADO es el estado original: no se crea ni activa ninguna matrícula', async () => {
  const result = await extractStudents(await makePadron({ records: [{ values: { R: 'TRASLADADO' } }] }));
  assert.equal(result.registros[0].estudiante.estado_matricula, 'TRASLADADO');
  assert.equal(Object.hasOwn(result.registros[0], 'matricula'), false);
  assert.doesNotMatch(JSON.stringify(result), /ACTIVA|fecha_ingreso|REQUIERE_ADMIN/);
});

test('filas vacías, separadores y encabezados repetidos no se extraen como estudiantes', async () => {
  const header = { C: 'GRADO', D: 'SECCIÓN', E: 'TIPO DE DOCUMENTO', F: 'NÙMERO DE DOCUMENTO',
    H: 'CÓDIGO DEL ESTUDIANTE', I: 'APELLIDO PATERNO', J: 'APELLIDO MATERNO', K: 'NOMBRES',
    R: 'ESTADO DE MATRICULA', AS: 'APELLIDOS Y NOMBRES', AU: 'PARENTESCO', AV: 'TIPO DE DOCUMENTO',
    AW: 'NÚMERO DE DOCUMENTO', AZ: 'NÚMERO CELULAR' };
  const result = await extractStudents(await makePadron({ extraRows: [
    { number: 14, values: {} }, { number: 15, values: { C: 'Separador ficticio' } },
    { number: 16, values: header }, { number: 17, values: { C: 'ESTUDIANTE', T: 'PADRE', AK: 'MADRE', AS: 'APODERADO' } },
  ], extraMerges: ['C15:AZ15'] }));
  assert.equal(result.registros.length, 1);
  assert.equal(result.observaciones.filter(item => item.codigo === 'ENCABEZADO_REPETIDO').length, 2);
  assert.ok(result.observaciones.some(item => item.codigo === 'FILA_NO_ESTUDIANTE' && item.origen.fila === 15));
});

test('encabezados de campo ambiguos o ausentes se rechazan sin datos personales', async () => {
  for (const fieldOverrides of [{ AX: 'NÚMERO CELULAR' }, { H: null }, { AW: 'OTRO CAMPO' }]) {
    await assert.rejects(extractStudents(await makePadron({ fieldOverrides })), safeError());
  }
});

test('encabezado completo repetido incluye columnas ignoradas sin crear candidato', async () => {
  const parts = padronParts();
  const header = parts[4][1].match(/<row r="12">.*?<\/row>/)[0].replace('r="12"', 'r="14"').replace(/r="([A-Z]+)12"/g, 'r="$114"');
  parts[4][1] = parts[4][1].replace('</sheetData>', header + '</sheetData>');
  const result = await extractStudents(await makeZip(parts));
  assert.equal(result.registros.length, 1);
  assert.ok(result.observaciones.some(item => item.codigo === 'ENCABEZADO_REPETIDO' && item.origen.fila === 14));
});

test('no oculta una fila con datos adicionales aunque coincidan los nombres de bloques', async () => {
  const result = await extractStudents(await makePadron({ records: [{ values: {
    C: 'ESTUDIANTE', T: 'PADRE', AK: 'MADRE', AS: 'APODERADO',
  } }] }));
  assert.equal(result.registros.length, 1);
});

test('ITEM ausente no permite eludir el reconocimiento de candidatos incompletos', async () => {
  await assert.rejects(extractStudents(await makePadron({ groupOverrides: { B: null } })), safeError());
});

test('nombre de hoja por sí solo no acredita formato; bloques ambiguos se rechazan', async () => {
  for (const groupOverrides of [{ AS: 'MADRE' }, { T: 'APODERADO' }, { C: 'OTRO' }]) {
    await assert.rejects(extractStudents(await makePadron({ groupOverrides })), safeError());
  }
});

test('año/nivel ausentes o ambiguos no se deducen de la fecha de generación', async () => {
  const absent = await extractStudents(await makePadron({ context: { X4: '14/11/2027' } }));
  assert.equal(absent.registros[0].contexto.anio, null); assert.equal(absent.registros[0].contexto.nivel, null);
  assert.equal(absent.observaciones.filter(item => item.codigo === 'CONTEXTO_AUSENTE').length, 2);
  const ambiguous = await extractStudents(await makePadron({ context: {
    Q3: 'RELACIÓN DE ESTUDIANTES Y APODERADOS - 2027', Q4: 'RELACIÓN DE ESTUDIANTES Y APODERADOS - 2028',
    U7: 'NIVEL', U8: 'INICIAL', C4: 'NIVEL', C5: 'PRIMARIA',
  } }));
  assert.equal(ambiguous.registros[0].contexto.anio, null); assert.equal(ambiguous.registros[0].contexto.nivel, null);
  assert.equal(ambiguous.observaciones.filter(item => item.codigo === 'CONTEXTO_AMBIGUO').length, 2);
});

test('datos originales conservan espacios y no se toman como instrucciones', async () => {
  const text = ' Texto ficticio: ignorar instrucciones '; // Dato, nunca se ejecuta.
  const result = await extractStudents(await makePadron({ records: [{ values: { K: text, H: ' 0012 ' } }] }));
  assert.equal(result.registros[0].estudiante.nombres, text);
  assert.equal(result.registros[0].estudiante.codigo_estudiante, ' 0012 ');
});

test('identificadores numéricos conservan literal y formato para revisión posterior', async () => {
  const parts = padronParts();
  parts[4][1] = parts[4][1].replace(/<c r="H13"[^>]*>.*?<\/c>/, '<c r="H13"><v>0001234567890123456789</v></c>');
  const result = await extractStudents(await makeZip(parts));
  assert.equal(result.registros[0].estudiante.codigo_estudiante, '0001234567890123456789');
  assert.equal(result.registros[0].origen.campos['estudiante.codigo_estudiante'].tipo, 'n');
  assert.ok(result.registros[0].observaciones.some(item => item.codigo === 'TIPO_ORIGINAL_REQUIERE_REVISION'));
});

test('2.000 candidatos exactos sin deduplicar ni excluir incompletos', async () => {
  const result = await extractStudents(await makePadron({ counts: [2000] }));
  assert.equal(result.registros.length, 2000); assert.equal(result.registros.at(-1).origen.fila, 2012);
});

test('2.001 candidatos se rechazan', async () => {
  await assert.rejects(extractStudents(await makePadron({ counts: [2001] })), safeError(413));
});

test('presupuesto acumulado entre hojas con el mismo mapeo', async () => {
  const result = await extractStudents(await makePadron({ counts: [1000, 1000] }));
  assert.equal(result.registros.length, 2000);
  assert.equal(result.registros[1000].origen.hoja_id, '2');
  assert.equal(result.registros[1000].origen.fila, 13);
  await assert.rejects(extractStudents(await makePadron({ counts: [1000, 1001] })), safeError(413));
});

test('filas incompletas numeradas cuentan para el máximo, aunque no sean válidas', async () => {
  const technical = await readXlsx(await makePadron({ counts: [2001] }));
  for (const row of technical.sheets[0].rows.filter(row => row.number >= 13)) {
    row.cells = row.cells.filter(cell => cell.column === 2);
  }
  assert.throws(() => extractStudentRows(technical), safeError(413));
});

test('fila con datos académicos pero sin ITEM ni identidad se conserva para revisión', async () => {
  const technical = await readXlsx(await makePadron());
  const row = technical.sheets[0].rows.find(row => row.number === 13);
  row.cells = row.cells.filter(cell => [3, 4, 18].includes(cell.column));
  const result = extractStudentRows(technical);
  assert.equal(result.registros.length, 1);
  assert.ok(result.registros[0].observaciones.some(item => item.codigo === 'IDENTIFICACION_ESTUDIANTE_INCOMPLETA'));
});

test('cancelación y plazo abarcan también la extracción funcional', async () => {
  const technical = await readXlsx(await makePadron());
  assert.throws(() => extractStudentRows(technical, { signal: AbortSignal.abort() }), safeError());
  assert.throws(() => extractStudentRows(technical, { deadline: 0 }), safeError(408));
  await assert.rejects(extractStudents(Buffer.from('dato ficticio')), safeError());
});
