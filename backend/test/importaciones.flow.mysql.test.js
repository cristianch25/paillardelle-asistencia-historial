import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import express from 'express';
import { confirmationContext } from '../src/modules/importaciones/confirmation-context.js';
import { createImportConfirmationService } from '../src/modules/importaciones/confirmation.service.js';
import { createConfirmationRepository } from '../src/modules/importaciones/confirmation.repository.js';
import { createImportPreviewService } from '../src/modules/importaciones/preview.service.js';
import { createImportPreviewRoutes } from '../src/modules/importaciones/routes.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { makePadron } from '../test-support/importaciones/padron-fixture.js';

const database = process.env.SIAGIE_MYSQL_DATABASE;
test('SIAGIE MySQL: SUBDIRECCION importa, omite pendientes y repite sin duplicar', { skip: !database }, async () => {
  assert.equal(database, 'siagie_diag_ficticio_despues_20261118_v2');
  const raw = mysql.createPool({ host: '127.0.0.1', port: 3311, user: 'root', password: '', database,
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, charset: 'utf8mb4' });
  const pool = { async getConnection() {
    const c = await raw.getConnection();
    try {
      const [[r]] = await c.query('SELECT @@port port, @@server_uuid uuid, DATABASE() db');
      assert.equal(Number(r.port),3311); assert.equal(r.db,database);
      assert.equal(r.uuid,'afb09129-e20f-11f1-8789-9c6b009e6a76'); return c;
    } catch (e) { c.destroy(); throw e; }
  }, async execute(sql, params) {
    const c = await this.getConnection(); try { return await c.execute(sql,params); } finally { c.release(); }
  } };
  const run = randomUUID().replaceAll('-','').slice(0,16);
  const guardianDocument = `88${String(randomInt(1_000_000)).padStart(6,'0')}`;
  await pool.execute(`INSERT INTO usuarios (nombres,apellidos,usuario,password_hash,rol,nivel_asignado,activo)
    VALUES ('Ficticio','SIAGIE',?,'NO_LOGIN_FICTICIO','SUBDIRECCION','INICIAL',1)`,[`ficticio_${run}`]);
  const [[actor]] = await pool.execute('SELECT id,rol,nivel_asignado,activo FROM usuarios WHERE usuario = ?', [`ficticio_${run}`]);
  actor.id = String(actor.id);
  const repository = createConfirmationRepository(() => pool);
  let failReceipt = true;
  const confirmation = createImportConfirmationService({ repository:{...repository, async appendReceipt(...args) {
    if (failReceipt) throw new Error('Fallo ficticio antes del recibo');
    return repository.appendReceipt(...args);
  } } });
  const preview = createImportPreviewService({ reconcile:confirmationContext(pool).reconcile, confirmation });
  const app = express();
  app.use('/api/importaciones',createImportPreviewRoutes({ authenticate:async () => actor },preview)); app.use(errorHandler);
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  const root = `http://127.0.0.1:${server.address().port}/api/importaciones`, headers = { Authorization:'Bearer ficticio' };
  const records = [
    { values:{ H:`${run}_0`,F:'',E:'',R:'DEFINITIVA',AW:guardianDocument,AZ:'999555666 / 988123456' } },
    { values:{ H:`${run}_1`,F:'',E:'',R:'DEFINITIVA',AW:'',AV:'',AZ:'incompleto' } },
    { values:{ H:`${run}_2`,F:'',E:'',R:'TRASLADADO',C:'',D:'SIN SECCION',AS:'',AU:'',AV:'',AW:'',AZ:'' } },
    { values:{ H:`${run}_3`,F:'',E:'',R:'DEFINITIVA',D:'SIN SECCION' } },
  ];
  async function upload() {
    const form = new FormData(); form.append('archivo',new Blob([await makePadron({records})]),'padron-ficticio.xlsx');
    const res = await fetch(`${root}/vistas-previas?anio_escolar_id=1&nivel=INICIAL&fecha_ingreso=2027-03-01`,{method:'POST',headers,body:form});
    const data = await res.json(); assert.equal(res.status,201,JSON.stringify(data)); return data;
  }
  const send = (path,method,body) => fetch(`${root}${path}`,{method,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const bodyFor = view => ({aceptar:true,version_plan:view.version_plan,filas:view.filas_seleccionadas,
    clave_operacion:randomUUID(),decisiones_telefono:view.decisiones_telefono.map(p=>({id_propuesta:p.id_propuesta,decision:'CONSERVAR'}))});
  async function totals() {
    const counts = {};
    for (const table of ['estudiantes','matriculas','matricula_secciones','contactos','estudiante_contactos']) {
      const [[r]] = await pool.execute(`SELECT COUNT(*) n FROM ${table}`); counts[table]=Number(r.n);
    }
    return counts;
  }
  try {
    const original = await totals(), initial = await upload();
    assert.equal(initial.resumen.pendientes,1); assert.equal(initial.filas_seleccionadas.length,3);
    const correction = await send(`/vistas-previas/${initial.id}/filas/1:13/contacto`,'PATCH',{telefono:'999555666',version:1});
    assert.equal(correction.status,200); const reviewed = await correction.json();
    const input = bodyFor(reviewed), postPath = `/vistas-previas/${reviewed.id}/confirmacion`;
    const failed = await send(postPath,'POST',input); assert.equal(failed.status,500);
    assert.deepEqual(await totals(),original);
    assert.equal((await confirmation.status(input.clave_operacion,actor)).estado,'SIN_CONFIRMACION_VERIFICADA');
    failReceipt = false;
    const first = await send(postPath,'POST',input); assert.equal(first.status,200); const saved = await first.json();
    assert.equal(saved.cantidades.importados,3); assert.equal(saved.cantidades.matriculas,2);
    assert.equal(saved.cantidades.contactos,1); assert.equal(saved.cantidades.vinculos,1);
    assert.equal(saved.cantidades.pendientes,1); assert.equal(saved.cantidades.contactos_pendientes,1);
    const after = await totals(); assert.equal(after.estudiantes-original.estudiantes,3); assert.equal(after.matriculas-original.matriculas,2);
    const [[transfer]] = await pool.execute('SELECT id FROM estudiantes WHERE codigo_estudiante = ?', [`${run}_2`]);
    const [enrollments] = await pool.execute('SELECT id FROM matriculas WHERE estudiante_id = ?', [transfer.id]); assert.equal(enrollments.length,0);
    const [[omitted]] = await pool.execute('SELECT COUNT(*) n FROM estudiantes WHERE codigo_estudiante = ?', [`${run}_3`]); assert.equal(Number(omitted.n),0);
    const repeatedView = await upload(); assert.equal(repeatedView.resumen.existentes,3);
    assert.equal(repeatedView.resumen.pendientes,1); assert.equal(repeatedView.confirmacion_habilitada,true);
    const second = await send(`/vistas-previas/${repeatedView.id}/confirmacion`,'POST',bodyFor(repeatedView));
    assert.equal(second.status,200); const repeated = await second.json();
    assert.equal(repeated.cantidades.importados,0); assert.equal(repeated.cantidades.existentes,3); assert.equal(repeated.cantidades.matriculas,0);
    assert.deepEqual(await totals(),after);
    const retry = await send(postPath,'POST',input); assert.equal((await retry.json()).confirmacion_id,saved.confirmacion_id);
    const receipt = await fetch(`${root}/confirmaciones/${input.clave_operacion}`,{headers}); assert.equal((await receipt.json()).estado,'CONFIRMADA');
    const denied = await fetch(`${root}/vistas-previas?anio_escolar_id=1&nivel=SECUNDARIA&fecha_ingreso=2027-03-01`,{method:'POST',headers}); assert.equal(denied.status,403);
    records.push({values:{H:`${run}_4`,F:'',E:'',R:'DEFINITIVA',AW:guardianDocument,AZ:'999555666'}});
    const mixedView = await upload();
    const mixedResponse = await send(`/vistas-previas/${mixedView.id}/confirmacion`,'POST',bodyFor(mixedView));
    assert.equal(mixedResponse.status,200); const mixed = await mixedResponse.json();
    assert.equal(mixed.cantidades.importados,1); assert.equal(mixed.cantidades.existentes,3);
    assert.equal(mixed.cantidades.matriculas,1); assert.equal(mixed.cantidades.pendientes,1);
    console.log(JSON.stringify({database,run,primera:saved.cantidades,repeticion:repeated.cantidades,delta_estudiantes:3,delta_matriculas:2}));
  } finally { server.closeAllConnections(); await new Promise(r=>server.close(r)); await raw.end(); }
});
