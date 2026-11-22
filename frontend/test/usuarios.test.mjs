import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { fixtureUser, usersFixture, userId } from './support/usuariosFixture.mjs';

let vite, api, model, client, Page, Auth, Form, Assignments, navigation, List;
const response = (config, data, status = 200) => ({ config, data, status, statusText: 'OK', headers: {} });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/usuarios/usuarios.api.ts');
  model = await vite.ssrLoadModule('/src/features/usuarios/usuarios.types.ts');
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  Page = (await vite.ssrLoadModule('/src/features/usuarios/UsersPage.tsx')).default;
  Form = (await vite.ssrLoadModule('/src/features/usuarios/UserForm.tsx')).default;
  Assignments = (await vite.ssrLoadModule('/src/features/usuarios/UserAssignments.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
  List = (await vite.ssrLoadModule('/src/features/usuarios/UsersList.tsx')).default;
});
after(async () => { await vite?.close(); });

const cards = (catalog, users = catalog.users) => renderToStaticMarkup(h(List, { users, catalog, busy: false,
  actorId: catalog.users[0].id, onEdit() {}, onState() {}, onAssignments() {}, onResetPassword() {} }));

test('tarjetas: nombre principal, cargo, estado discreto y acciones conservadas, sin identificadores habituales', () => {
  const catalog = usersFixture(), html = cards(catalog);
  assert.match(html, /font-bold">María Pérez/); assert.match(html, /Docente/); assert.match(html, /Auxiliar/);
  assert.match(html, /Activo/); assert.match(html, /Inactivo/);
  assert.doesNotMatch(html, /maria\.prueba|admin\.prueba|Secciones vigentes|Sin asignaciones vigentes/);
  assert.match(html, /Primaria: 1 A/); assert.doesNotMatch(html, /1.º/);
  assert.match(html, /Sin secciones asignadas/);
  for (const action of ['Editar', 'Desactivar', 'Activar', 'Restablecer contraseña']) assert.ok(html.includes(action));
});

test('homónimos se detectan en todo el catálogo, aunque solo una cuenta esté en la página o filtro', () => {
  const catalog = usersFixture();
  catalog.users[2] = { ...catalog.users[2], nombres: '  MARÍA  ', apellidos: 'PÉREZ' };
  const before = structuredClone(catalog), html = cards(catalog, [catalog.users[1]]);
  assert.match(html, /maria\.prueba/);
  assert.equal(model.matchesUser(catalog.users[1], 'maria.prueba'), true);
  assert.equal(model.matchesUser(catalog.users[1], userId), true);
  assert.deepEqual(catalog, before);
});

test('ADMIN no ofrece gestión operativa de asignaciones para ningún rol', () => {
  for (const rol of ['ADMIN', 'SUBDIRECCION', 'SUPERUSUARIO', 'REGISTRADOR']) {
    for (const cargo of ['DOCENTE', 'AUXILIAR', null]) {
      const user = fixtureUser({ rol, cargo }), catalog = { ...usersFixture(), users: [user] };
      const html = cards(catalog);
      assert.equal(/>Asignaciones<\/button>/.test(html), false, `${rol}/${cargo}`);
      for (const label of ['Editar', 'Desactivar', 'Restablecer contraseña']) assert.ok(html.includes(label));
    }
  }
});

test('asignaciones: varias secciones y años identificados, sin mostrar vínculos finalizados o futuros', () => {
  const catalog = usersFixture(), user = catalog.users[1];
  const section = { ...catalog.sections[0], id: 'anterior', anio_escolar_id: catalog.years[1].id };
  catalog.sections.push(section);
  catalog.assignments.push({ ...catalog.assignments[0], id: 'otra', seccion_id: section.id, fecha_inicio: '2025-01-01' },
    { ...catalog.assignments[0], id: 'historica', seccion_id: catalog.sections[1].id, fecha_fin: '2025-12-31' },
    { ...catalog.assignments[0], id: 'futura', seccion_id: catalog.sections[1].id, fecha_inicio: '9999-01-01' });
  const html = cards(catalog, [user]);
  assert.match(html, /Primaria · 2026: 1 A/);
  assert.match(html, /Primaria · 2025 \(año cerrado\): 1 A/);
  assert.doesNotMatch(html, /Secundaria/);
});

test('tarjetas agrupan varias secciones por nivel sin repetir el nivel ni usar ordinales', () => {
  const catalog = usersFixture(), user = catalog.users[1]; user.nivel_asignado = null;
  for (const [id, letra] of [['otra', 'B'], ['tercera', 'C']]) {
    catalog.sections.push({ ...catalog.sections[0], id, letra });
    catalog.assignments.push({ ...catalog.assignments[0], id, seccion_id: id });
  }
  catalog.assignments.push({ ...catalog.assignments[0], id: 'secundaria', seccion_id: catalog.sections[1].id });
  const before = structuredClone(catalog), html = cards(catalog, [user]);
  assert.match(html, /Primaria: 1 A, 1 B, 1 C/); assert.match(html, /Secundaria: 1 B/);
  assert.equal((html.match(/Primaria:/g) ?? []).length, 1); assert.doesNotMatch(html, /\.º/);
  assert.deepEqual(catalog, before);
});

test('rol y cargo separados; SUBDIRECCION requiere nivel y admite cargo opcional de 30 caracteres', () => {
  const draft = { ...model.initialUserDraft(), nombres: ' Rosa ', apellidos: ' Diaz ', usuario: 'rosa', password: 'inicial-ficticia' };
  for (const cargo of ['DOCENTE', 'AUXILIAR']) {
    assert.deepEqual(model.userRequest({ ...draft, cargo }), { nombres: 'Rosa', apellidos: 'Diaz', usuario: 'rosa', rol: 'REGISTRADOR',
      cargo, nivel_asignado: null, password: draft.password });
  }
  assert.throws(() => model.userRequest({ ...draft, rol: 'ADMIN' }));
  assert.throws(() => model.userRequest({ ...draft, rol: 'DOCENTE' }));
  assert.throws(() => model.userRequest({ ...draft, cargo: 'OTRO' }));
  assert.throws(() => model.userRequest({ ...draft, rol: 'SUBDIRECCION' }));
  const sub = { ...draft, rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA', cargo: '' };
  assert.equal(model.userRequest(sub).cargo, null);
  assert.equal(model.initialUserDraft(fixtureUser({ rol: 'SUBDIRECCION', cargo: null })).cargo, '');
  assert.throws(() => model.userRequest({ ...sub, cargo: 'a'.repeat(31) }));
  assert.equal(model.userRequest({ ...sub, cargo: 'a'.repeat(30) }).cargo.length, 30);
});

test('password inicial por bytes, Unicode válido, sin contraseña ni promoción ADMIN en edición', () => {
  const user = fixtureUser(), draft = { ...model.initialUserDraft(user), password: 'á'.repeat(36) };
  assert.equal(model.userRequest(draft).password, draft.password);
  for (const password of ['', 'á'.repeat(37), '\ud800']) assert.throws(() => model.userRequest({ ...draft, password }));
  assert.equal('password' in model.userRequest(draft, user), false);
  const admin = fixtureUser({ rol: 'ADMIN' });
  assert.deepEqual(Object.keys(model.userRequest({ ...draft, rol: 'ADMIN' }, admin)).sort(), ['apellidos', 'nombres', 'usuario']);
  assert.throws(() => model.userRequest({ ...draft, rol: 'ADMIN' }, user));
  assert.throws(() => model.userRequest({ ...draft, nombres: '\ud800' }, user));
  assert.equal(model.matchesUser(user, 'MARIA pérez'), true);
  assert.equal(model.matchesUser(user, userId), true);
});

test('catálogo completo con paginación, sin filtrar silenciosamente usuarios ni perder históricos', async () => {
  const fixture = usersFixture(), calls = [];
  client.defaults.adapter = async config => {
    calls.push(config);
    const params = config.params, key = ({ '/usuarios': 'users', '/asignaciones': 'asignaciones', '/secciones/': 'secciones', '/anios-escolares': 'anios_escolares' })[config.url];
    const rows = ({ users: fixture.users, asignaciones: fixture.assignments, secciones: fixture.sections, anios_escolares: fixture.years })[key];
    return response(config, { [key]: config.url === '/usuarios' ? rows.slice((params.page - 1) * 2, params.page * 2) : rows,
      pagination: { page: params.page, limit: 100, has_more: config.url === '/usuarios' && params.page === 1 } });
  };
  assert.deepEqual(await api.getUsersCatalog(() => true), fixture);
  assert.equal(calls.filter(call => call.url === '/usuarios').length, 2);
  assert.ok(calls.every(call => call.method === 'get'));
  assert.equal(await api.getUsersCatalog(() => false), null);
});

test('error de página o duplicado impide publicar catálogo parcial; no reintenta', async () => {
  const fixture = usersFixture();
  for (const status of [403, 500]) {
    let attempts = 0;
    client.defaults.adapter = async config => {
      if (config.url === '/usuarios') { attempts++; throw new AxiosError('Privado', '', config, null, { config, status }); }
      const key = ({ '/asignaciones': 'asignaciones', '/secciones/': 'secciones', '/anios-escolares': 'anios_escolares' })[config.url];
      return response(config, { [key]: [], pagination: { ...config.params, has_more: false } });
    };
    await assert.rejects(api.getUsersCatalog(() => true)); assert.equal(attempts, 1);
  }
  client.defaults.adapter = async config => {
    const key = ({ '/usuarios': 'users', '/asignaciones': 'asignaciones', '/secciones/': 'secciones', '/anios-escolares': 'anios_escolares' })[config.url];
    return response(config, { [key]: config.url === '/usuarios' ? [fixture.users[0], fixture.users[0]] : [], pagination: { ...config.params, has_more: false } });
  };
  await assert.rejects(api.getUsersCatalog(() => true));
});

test('alta/edición/estado/asignación usan APIs existentes, IDs exactos y confirmación', async () => {
  const user = fixtureUser(), draft = { ...model.initialUserDraft(user), password: 'inicial-simulada' }, requests = [];
  client.defaults.adapter = async config => {
    const body = JSON.parse(config.data); requests.push({ method: config.method, url: config.url, body });
    if (config.url === '/asignaciones') return response(config, { asignacion: { id: '999', ...body } }, 201);
    return response(config, { user: { ...user, ...body } }, config.method === 'post' ? 201 : 200);
  };
  await api.saveUser(draft); await api.saveUser(draft, user); await api.setUserState(userId, false);
  const assignment = { usuario_id: userId, seccion_id: '9007199254741020', fecha_inicio: '2026-03-01', fecha_fin: null };
  await api.createUserAssignment(assignment);
  assert.equal(requests[0].body.password, draft.password);
  assert.equal('password' in requests[1].body, false);
  assert.deepEqual(requests[2], { method: 'patch', url: `/usuarios/${userId}/estado`, body: { activo: false } });
  assert.deepEqual(requests[3], { method: 'post', url: '/asignaciones', body: assignment });
  client.defaults.adapter = async config => response(config, { user: { ...user, id: 'otro' } });
  await assert.rejects(api.saveUser(draft, user));
});

test('escritura incierta bloquea reenvío; 400/409 conservan mensaje seguro de validación', () => {
  assert.equal(api.uncertainUserFailure(new Error('Confirmación')), true);
  for (const status of [400, 401, 403, 404, 409, 413, 500, undefined]) {
    const error = new AxiosError('Secreto', '', {}, null, status ? { status, data: { error: 'Validación permitida' } } : undefined);
    assert.equal(api.uncertainUserFailure(error), status === 500 || status === undefined);
    assert.doesNotMatch(api.userFailure(error), /Secreto/);
    if ([400, 409].includes(status)) assert.equal(api.userFailure(error), 'Validación permitida');
  }
});

test('menú/ruta solo ADMIN; formularios no ofrecen ADMIN ni secretos existentes', () => {
  for (const rol of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
    const user = fixtureUser({ rol });
    assert.equal(navigation.navigationFor(rol).some(item => item.path === '/usuarios'), rol === 'ADMIN');
    const html = renderToStaticMarkup(h(MemoryRouter, null, h(Auth.Provider, { value: { session: { user, expiresAt: 1 } } }, h(Page))));
    assert.equal(html.includes('Nuevo usuario'), rol === 'ADMIN');
  }
  for (const user of [undefined, fixtureUser(), fixtureUser({ rol: 'ADMIN' })]) {
    const html = renderToStaticMarkup(h(Form, { user, busy: false, onSave() {}, onCancel() {} }));
    assert.doesNotMatch(html, /option value="ADMIN"/);
    assert.equal(html.includes('type="password"'), !user);
  }
  const html = renderToStaticMarkup(h(Assignments, { user: fixtureUser({ activo: false }), catalog: usersFixture(), busy: false, onSave() {}, onClose() {} }));
  assert.match(html, /Sin fecha de fin/); assert.doesNotMatch(html, /Crear asignación/);
});
