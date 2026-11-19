import { HttpError } from '../../shared/http-error.js';
const invalid = () => { throw new HttpError(400, 'Confirmación de importación inválida.'); };
export function operationKey(key) {
  if (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)) invalid();
  return key;
}
export function confirmationInput(body) {
  const fields = ['aceptar', 'version_plan', 'filas', 'clave_operacion', 'decisiones_telefono'];
  if (!body || Array.isArray(body) || Object.keys(body).length !== fields.length
    || fields.some(key => !Object.hasOwn(body, key)) || body.aceptar !== true
    || typeof body.version_plan !== 'string' || !/^[a-f0-9]{64}$/.test(body.version_plan)
    || !Array.isArray(body.filas) || !body.filas.length || body.filas.length > 2000
    || body.filas.some(id => typeof id !== 'string' || !/^\d+:\d+$/.test(id) || id.length > 64)
    || new Set(body.filas).size !== body.filas.length || !Array.isArray(body.decisiones_telefono)
    || body.decisiones_telefono.length > 2000) invalid();
  operationKey(body.clave_operacion);
  const decisions = body.decisiones_telefono;
  if (decisions.some(row => !row || Object.keys(row).length !== 2 || typeof row.id_propuesta !== 'string'
    || !/^a\d+$/.test(row.id_propuesta) || !['ACTUALIZAR', 'CONSERVAR'].includes(row.decision))
    || new Set(decisions.map(row => row.id_propuesta)).size !== decisions.length) invalid();
  return { aceptar: true, version_plan: body.version_plan, filas: [...body.filas].sort(), clave_operacion: body.clave_operacion,
    decisiones_telefono: decisions.map(row => ({ id_propuesta: row.id_propuesta, decision: row.decision }))
      .sort((a, b) => a.id_propuesta.localeCompare(b.id_propuesta)) };
}
