import './env.js';
import mysql from 'mysql2/promise';

export const EXPECTED_DATABASE = 'asistencia_paillardelle';

export function readDatabaseConfig(env = process.env) {
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (typeof env[key] !== 'string' || env[key].length === 0) {
      throw Object.assign(new Error(`Configura ${key} en backend/.env o en el entorno.`), {
        code: 'DB_CONFIG_MISSING',
      });
    }
  }

  const port = Number(env.DB_PORT);
  if (!/^\d+$/.test(env.DB_PORT) || port < 1 || port > 65535) {
    throw Object.assign(new Error('DB_PORT debe ser un entero entre 1 y 65535.'), {
      code: 'DB_CONFIG_PORT',
    });
  }
  if (env.DB_NAME !== EXPECTED_DATABASE) {
    throw Object.assign(new Error('DB_NAME debe coincidir con la base definida en el esquema SQL.'), {
      code: 'DB_CONFIG_DATABASE',
    });
  }

  return {
    host: env.DB_HOST,
    port,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 20,
    connectTimeout: 5000,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    multipleStatements: false,
  };
}

let pool;

// Un único pool, creado al solicitarlo; importar no abre conexiones.
export function getPool() {
  pool ??= mysql.createPool(readDatabaseConfig());
  return pool;
}
