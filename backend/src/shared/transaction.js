// Ejecuta una operación en una transacción y libera o descarta su conexión.
function discard(connection) {
  try { connection.destroy(); } catch { /* La limpieza no debe ocultar el error principal. */ }
}

// Confirma todos los cambios juntos y conserva el error original si la operación falla.
export async function inTransaction(pool, work) {
  const connection = await pool.getConnection();
  let reusable = true;
  let failed = false;
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    // Si COMMIT falla, el resultado puede ser incierto incluso tras un ROLLBACK.
    reusable = false;
    await connection.commit();
    reusable = true;
    return result;
  } catch (error) {
    failed = true;
    try { await connection.rollback(); } catch { reusable = false; }
    throw error;
  } finally {
    if (!reusable) discard(connection);
    else {
      try { connection.release(); } catch (error) {
        discard(connection);
        if (!failed) throw error;
      }
    }
  }
}
