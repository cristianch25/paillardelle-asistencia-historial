import { once } from 'node:events';
import { testAdmin } from './admin-prueba.js';

function ensure(condition, code) {
  if (!condition) throw Object.assign(new Error(), { code });
}

// Servidor del backend real, accesible solo en loopback y con puerto temporal.
export async function probeAuthentication(app, password, expectedId, report = console.log) {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const request = (path, options = {}) => fetch(`${baseUrl}/api/auth/${path}`, {
      ...options, signal: AbortSignal.timeout(10000),
    });
    const login = secret => request('login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: testAdmin.usuario, password: secret }),
    });

    let response = await login(password);
    const session = await response.json();
    ensure(response.status === 200 && typeof session.access_token === 'string'
      && session.token_type === 'Bearer' && session.user?.id === expectedId
      && session.user?.usuario === testAdmin.usuario && session.user?.rol === 'ADMIN'
      && !Object.hasOwn(session.user, 'password_hash')
      && !Object.hasOwn(session.user, 'password'), 'TEST_LOGIN_FAILED');
    report('POST /api/auth/login: 200 OK (token recibido, no mostrado).');

    response = await request('me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const profile = await response.json();
    ensure(response.status === 200 && profile.user?.id === expectedId
      && profile.user?.nombres === testAdmin.nombres
      && profile.user?.apellidos === testAdmin.apellidos
      && profile.user?.usuario === testAdmin.usuario && profile.user?.rol === 'ADMIN'
      && !Object.hasOwn(profile.user, 'password_hash')
      && !Object.hasOwn(profile.user, 'password'), 'TEST_ME_FAILED');
    report('GET /api/auth/me: 200 OK (perfil ADMIN comprobado).');

    const wrongPassword = password === 'intento-invalido' ? 'otro-intento-invalido' : 'intento-invalido';
    response = await login(wrongPassword);
    await response.text();
    ensure(response.status === 401, 'TEST_401_FAILED');
    report('Login con contraseña incorrecta: 401 OK.');

    response = await request('me');
    await response.text();
    ensure(response.status === 401, 'TEST_401_FAILED');
    report('GET /api/auth/me sin token: 401 OK.');

    const parts = session.access_token.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    response = await request('me', { headers: { Authorization: `Bearer ${parts.join('.')}` } });
    await response.text();
    ensure(response.status === 401, 'TEST_401_FAILED');
    report('GET /api/auth/me con firma alterada: 401 OK.');
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
  }
}
