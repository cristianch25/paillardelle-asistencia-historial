import { createImportPreviewService } from '../../src/modules/importaciones/preview.service.js';
import { createImportConfirmationService } from '../../src/modules/importaciones/confirmation.service.js';
import { createConfirmationRepository } from '../../src/modules/importaciones/confirmation.repository.js';
import { actor, selection, record, serviceFixture } from './reconciliation-fixture.js';

export async function confirmationFixture(options = {}) {
  const state = { receipts: [], audits: [], students: [], enrollments: [], contacts: [], links: [], events: [], ...options };
  const reconciliation = { ...options, contacts: state.contacts };
  const reconcile = serviceFixture(reconciliation).service;
  let tail = Promise.resolve(), nextId = 9007199254741000n;
  const pool = { async getConnection() {
    let unlock, pending = [], audits = [], lastId;
    const step = name => { state.events.push(name); if (state.failAt === name) throw state.error ?? new Error('Privado'); };
    const finish = () => { unlock?.(); unlock = null; };
    return {
      addEffect(effect) { pending.push(effect); },
      async query() { step('isolation'); }, async beginTransaction() { step('begin'); },
      async execute(sql, params = []) {
        if (sql === 'TEST_IDENTITY_WRITE') {
          const [id, data] = params;
          pending.push(() => state.students.push({ id, ...data })); return [{ affectedRows: 1 }];
        }
        if (sql === 'TEST_ACADEMIC_WRITE') {
          const [id, body] = params;
          pending.push(() => { if (body.estudiante) state.students.push({ id, ...body.estudiante }); state.enrollments.push(body); });
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('FROM usuarios')) {
          const prior = tail; tail = new Promise(resolve => { unlock = resolve; }); await prior;
          await state.beforeActor?.(); step('actor');
          return [[state.current === undefined ? actor : state.current].filter(Boolean)];
        }
        if (sql.includes('SELECT id, datos_nuevos')) {
          step('receipt'); return [state.receipts.filter(row => row.actorId === params[0] && row.data.clave_operacion === params[1])
            .map(row => ({ id: row.id, datos_nuevos: row.data }))];
        }
        if (sql.includes('LAST_INSERT_ID')) return [[{ id: lastId }]];
        if (sql.startsWith('INSERT INTO contactos')) {
          step('contact'); lastId = String(nextId++);
          if (state.contacts.some(row => row.numero_documento === params[1])) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
          const row = { id: lastId, tipo_documento: params[0], numero_documento: params[1], nombres_apellidos: params[2], telefono: params[3] };
          pending.push(() => state.contacts.push(row)); return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO estudiante_contactos')) {
          step('link'); lastId = String(nextId++);
          if (!params[0] || !params[1]) throw new Error('FK inválida');
          pending.push(() => state.links.push(params)); return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('UPDATE contactos')) {
          step('phone'); pending.push(() => { state.contacts.find(row => row.id === params[1]).telefono = params[0]; });
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
          step(params[1] === 'CONFIRMAR_IMPORTACION_SIAGIE' ? 'receiptAudit' : 'audit');
          lastId = String(nextId++); const row = { id: lastId, actorId: params[0], data: JSON.parse(params[5]), action: params[1] };
          audits.push(row); return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('SELECT')) { step('lock'); await state.onLock?.(); return [[]]; }
        throw new Error(`SQL inesperado: ${sql}`);
      },
      async commit() {
        step('commit'); pending.forEach(effect => effect()); state.audits.push(...audits);
        state.receipts.push(...audits.filter(row => row.action === 'CONFIRMAR_IMPORTACION_SIAGIE')); finish();
        if (state.afterPersist) throw state.error ?? new Error('COMMIT incierto');
      },
      async rollback() { state.events.push('rollback'); pending = []; audits = []; finish(); },
      release() { state.events.push('release'); finish(); }, destroy() { state.events.push('destroy'); finish(); },
    };
  } };
  const repository = createConfirmationRepository(() => pool);
  const contextFor = connection => ({ reconcile, identitiesService: { async insertIdentity(data) {
    const id = String(nextId++);
    await connection.execute('TEST_IDENTITY_WRITE', [id, data]);
    return { estudiante: { id, ...data } };
  } }, matriculasService: { async createInTransaction(body) {
    stepAcademic(); const id = body.estudiante_id ?? String(nextId++), matriculaId = String(nextId++);
    if (body.estudiante && state.students.some(row => row.codigo_estudiante === body.estudiante.codigo_estudiante)) {
      throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
    }
    await connection.execute('TEST_ACADEMIC_WRITE', [id, body]);
    return { estudiante: { id }, matricula: { id: matriculaId } };
  } } });
  function stepAcademic() { state.events.push('academic'); state.onAcademic?.(); if (state.failAt === 'academic') throw state.error ?? new Error('Privado'); }
  const confirmation = createImportConfirmationService({ repository, contextFor, getToday: options.getToday });
  const records = options.records ?? [record()];
  const preview = createImportPreviewService({ reconcile, confirmation, store: options.store, analyze: async () => ({ registros: records, observaciones: [] }) });
  const reservation = await preview.begin(selection, actor), view = await preview.load(reservation, Buffer.from('fixture'), actor);
  const input = { aceptar: true, version_plan: view.version_plan, filas: view.filas_seleccionadas,
    clave_operacion: '11111111-1111-4111-8111-111111111111', decisiones_telefono: [] };
  return { state, preview, view, input, confirmation, repository, contextFor, reconciliation,
    restart: () => createImportConfirmationService({ repository: createConfirmationRepository(() => pool), contextFor }),
    confirm: (body = input, who = actor) => preview.confirm(view.id, body, who),
    close: () => preview.discard(view.id) };
}
