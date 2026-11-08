import bcrypt from 'bcrypt';

// Operación puntual autorizada. No permite elegir otro usuario ni otro rol.
export const testAdmin = Object.freeze({
  nombres: 'Administrador', apellidos: 'Prueba', usuario: 'admin_prueba',
});

function failure(code) {
  return Object.assign(new Error(), { code });
}

export async function assertAdminAbsent(connection) {
  const [rows] = await connection.execute(
    'SELECT id FROM usuarios WHERE usuario = ? LIMIT 1', [testAdmin.usuario],
  );
  if (rows.length !== 0) throw failure('TEST_ADMIN_EXISTS');
}

export async function insertTestAdmin(connection, password) {
  if (typeof password !== 'string' || password.length === 0
    || Buffer.byteLength(password, 'utf8') > 72) throw failure('TEST_PASSWORD_INVALID');
  const hash = await bcrypt.hash(password, 12);
  if (!await bcrypt.compare(password, hash)) throw failure('TEST_HASH_FAILED');

  await connection.beginTransaction();
  try {
    await assertAdminAbsent(connection);
    const [result] = await connection.execute(
      'INSERT INTO usuarios (nombres, apellidos, usuario, password_hash, rol) VALUES (?, ?, ?, ?, ?)',
      [testAdmin.nombres, testAdmin.apellidos, testAdmin.usuario, hash, 'ADMIN'],
    );
    if (result.affectedRows !== 1) throw failure('TEST_INSERT_FAILED');
    const [rows] = await connection.execute(
      `SELECT id, nombres, apellidos, usuario, rol, cargo, nivel_asignado,
        puede_escanear_qr, puede_usar_bitacora, activo
       FROM usuarios WHERE usuario = ? LIMIT 1`, [testAdmin.usuario],
    );
    const row = rows[0];
    if (rows.length !== 1 || row.nombres !== testAdmin.nombres
      || row.apellidos !== testAdmin.apellidos || row.usuario !== testAdmin.usuario
      || row.rol !== 'ADMIN' || row.activo !== 1 || row.cargo !== null
      || row.nivel_asignado !== null || row.puede_escanear_qr !== 0
      || row.puede_usar_bitacora !== 0) throw failure('TEST_INSERT_FAILED');
    await connection.commit();
    return String(row.id);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
