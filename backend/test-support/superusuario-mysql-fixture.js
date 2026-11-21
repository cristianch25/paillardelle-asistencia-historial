import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createAuthRoutes } from '../src/modules/auth/auth.routes.js';
import { createUsuariosRoutes } from '../src/modules/usuarios/usuarios.routes.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createPasswordResetService } from '../src/modules/usuarios/usuarios.password.service.js';
import { createPasswordResetRepository } from '../src/modules/usuarios/usuarios.password.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createAniosEscolaresRoutes } from '../src/modules/organizacion-escolar/anios-escolares/routes.js';
import { createSeccionesRoutes } from '../src/modules/organizacion-escolar/secciones/routes.js';
import { createEnrollmentRoutes } from '../src/modules/matriculas/routes.js';
import { createAttendanceRoutes } from '../src/modules/asistencias/routes.js';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { createAttendanceListRepository } from '../src/modules/asistencias/list.repository.js';
import { createAuditRoutes } from '../src/modules/auditoria/routes.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { fixturePassword, originalNames, digest } from './superusuario-mysql-schema.js';

export function services(pool, tokens) {
  const provider = () => pool;
  const passwords = createPasswordResetService({ repository: createPasswordResetRepository(provider) });
  const users = createUsuariosService({ repository: createUsuariosRepository(provider), passwords,
    supervision: createSupervisionService({ repository: createSupervisionRepository(provider) }) });
  const auth = createAuthService({ repository: createAuthRepository(provider), tokens });
  return { users, auth };
}
export async function fixture(pool) {
  const tokens = createTokenService(() => ({ secret: randomSecret, expiresIn: 900 }));
  const randomSecret = randomBytes(48).toString('hex');
  const { users, auth } = services(pool, tokens);
  const [originals] = await pool.execute('SELECT * FROM usuarios ORDER BY id');
  assert.deepEqual(originals.map(row => row.usuario), originalNames);
  assert.ok(originals.every(row => row.debe_cambiar_password === 0));
  const ids = Object.fromEntries(originals.map(row => [row.usuario, String(row.id)]));
  const originalDigest = digest(originals);
  const app = express();
  app.use('/api/auth', createAuthRoutes(auth));
  app.use('/api/usuarios', createUsuariosRoutes(auth, users));
  // Endpoints reales que rechazan al rol técnico; cualquier fallback SQL queda bloqueado.
  app.use('/api/anios-escolares', createAniosEscolaresRoutes(auth));
  app.use('/api/secciones', createSeccionesRoutes(auth));
  app.use('/api/matriculas', createEnrollmentRoutes(auth).router);
  app.use('/api/auditoria', createAuditRoutes(auth));
  app.use('/api/asistencias', createAttendanceRoutes(auth, createAttendanceService({
    listRepository: createAttendanceListRepository(() => pool), users })));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  async function request(token, method, endpoint, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${endpoint}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  }
  async function snapshot() {
    const [accounts] = await pool.execute('SELECT * FROM usuarios ORDER BY id');
    const [audits] = await pool.execute('SELECT * FROM auditoria_administrativa ORDER BY id');
    return digest([accounts, audits]);
  }
  return { pool, users, auth, tokens, ids, request, snapshot, originalDigest,
    login: (usuario, password = fixturePassword) => auth.login({ usuario, password }),
    async account(id) { return (await pool.execute('SELECT * FROM usuarios WHERE id=?', [id]))[0][0]; },
    async originalAccountsUnchanged() {
      const [rows] = await pool.execute(`SELECT * FROM usuarios WHERE usuario IN (${originalNames.map(() => '?').join(',')}) ORDER BY id`, originalNames);
      assert.equal(digest(rows), originalDigest);
    },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
