import bcrypt from 'bcrypt';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createPasswordResetRepository } from '../src/modules/usuarios/usuarios.password.repository.js';
import { createPasswordResetService } from '../src/modules/usuarios/usuarios.password.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { testUser, updatePool } from './usuarios-update-pool.js';

export async function superuserFixture() {
  const hash = await bcrypt.hash('ClaveFicticiaInicial', 4);
  const state = updatePool([testUser('1'), testUser('2'),
    testUser('3', 'SUBDIRECCION', { nivel_asignado: 'PRIMARIA' }),
    testUser('4', 'REGISTRADOR'), testUser('9', 'SUPERUSUARIO')]
    .map(user => ({ ...user, password_hash: hash })));
  const inspect = state.pool.execute;
  state.pool.execute = async (sql, params) => {
    if (sql.startsWith('SELECT u.id')) return inspect(sql, params);
    if (sql.includes('WHERE rol IN')) {
      const roles = params.slice(0, -2), [limit, offset] = params.slice(-2);
      return [[...state.users.values()].filter(user => roles.includes(user.rol)).slice(offset, offset + limit)];
    }
    const user = sql.includes('WHERE usuario =')
      ? [...state.users.values()].find(row => row.usuario === params[0]) : state.users.get(params[0]);
    return [user ? [{ ...user }] : []];
  };
  const provider = () => state.pool;
  const tokens = createTokenService(() => ({
    secret: 'secreto-ficticio-superusuario-etapa-dos-1234567890', expiresIn: 900,
  }));
  const authService = createAuthService({ tokens, repository: createAuthRepository(provider) });
  const passwords = createPasswordResetService({ repository: createPasswordResetRepository(provider),
    hash: value => bcrypt.hash(value, 4) });
  const supervision = createSupervisionService({ repository: createSupervisionRepository(provider) });
  const repository = createUsuariosRepository(provider);
  const usuariosService = createUsuariosService({ repository, passwords, supervision });
  return { state, tokens, authService, usuariosService, passwords, repository };
}
