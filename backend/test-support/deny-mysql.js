// Preload exclusivo de validación con mocks; no importar en un servidor o suite real.
import mysql from 'mysql2/promise';
import callbackMysql from 'mysql2';
for (const driver of [mysql, callbackMysql]) {
  for (const key of ['createConnection', 'createPool', 'createPoolCluster']) {
    driver[key] = () => { throw new Error('MySQL prohibido en la validación con mocks.'); };
  }
}
delete process.env.SIAGIE_MYSQL_DATABASE;
delete process.env.MATRICULAS_MYSQL_ENABLE;
delete process.env.SUPERUSUARIO_MYSQL_ENABLE;
