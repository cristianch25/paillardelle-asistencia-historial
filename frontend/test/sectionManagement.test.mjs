import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';

let vite, api, client;
const section = { id: '9007199254740995', anio_escolar_id: '9007199254740993', nivel: 'INICIAL',
  grado: 4, letra: 'CREATIVOS', activo: true, turno: null };
const input = { anio_escolar_id: section.anio_escolar_id, nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' };
const patch = { esperado: { grado: 4, letra: 'CREATIVOS', activo: true }, cambios: { activo: false } };
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/secciones.api.ts');
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });

test('POST/PATCH conservan contrato autorizado y BIGINT; confirman los valores persistidos', async () => {
  const calls = [];
  client.defaults.adapter = async config => {
    calls.push({ method: config.method, url: config.url, body: JSON.parse(config.data) });
    return { config, status: config.method === 'post' ? 201 : 200, statusText: 'OK', headers: {},
      data: { seccion: { ...section, activo: config.method === 'post' } } };
  };
  assert.deepEqual(await api.createSection(input), section);
  assert.deepEqual(await api.updateSection(section.id, patch), { ...section, activo: false });
  assert.deepEqual(calls, [{ method: 'post', url: '/secciones', body: input },
    { method: 'patch', url: `/secciones/${section.id}`, body: patch }]);
});

test('respuestas incompletas/ajenas o sin cambios aplicados nunca confirman éxito', async () => {
  for (const bad of [{}, { seccion: { ...section, id: '2' } }, { seccion: section }]) {
    client.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: bad });
    await assert.rejects(api.updateSection(section.id, patch), /Confirmación/);
  }
  client.defaults.adapter = async config => ({ config, status: 201, headers: {}, data: { seccion: { ...section, grado: 5 } } });
  await assert.rejects(api.createSection(input), /Confirmación/);
});

test('409/red/500 no reenvían la escritura ni hacen consultas implícitas', async () => {
  for (const status of [409, 500, undefined]) {
    let calls = 0;
    client.defaults.adapter = async config => { calls++; throw new AxiosError('privado', '', config, null, status ? { config, status } : undefined); };
    await assert.rejects(api.updateSection(section.id, patch)); assert.equal(calls, 1);
  }
});

test('niveles confirmados por GET Secciones: incluye adicionales aun sin filas y excluye solo 403', async () => {
  for (const allowed of [['INICIAL', 'PRIMARIA', 'SECUNDARIA'], ['PRIMARIA'], ['SECUNDARIA'], ['INICIAL', 'PRIMARIA'], ['PRIMARIA', 'SECUNDARIA']]) {
    const calls = [];
    client.defaults.adapter = async config => {
      calls.push(config.params);
      if (!allowed.includes(config.params.nivel)) throw new AxiosError('denegado', '', config, null, { config, status: 403 });
      return { config, status: 200, headers: {}, data: { secciones: [], pagination: { page: 1, limit: 1, has_more: false } } };
    };
    assert.deepEqual(await api.getSectionManagementLevels(), allowed);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(query => Object.keys(query).sort().join() === 'limit,nivel,page' && query.limit === 1));
  }
});

test('fallos de niveles de red/401/500 o respuesta inválida no publican permisos parciales', async () => {
  for (const status of [undefined, 401, 500, 'invalid']) {
    client.defaults.adapter = async config => {
      if (config.params.nivel === 'PRIMARIA' && status !== 'invalid') throw new AxiosError('privado', '', config, null, status ? { config, status } : undefined);
      return { config, status: 200, headers: {}, data: { secciones: [], pagination: { page: 1, limit: status === 'invalid' ? 100 : 1, has_more: false } } };
    };
    await assert.rejects(api.getSectionManagementLevels());
  }
});
