// Confirma el plan SIAGIE revisado y permite recuperar el resultado mediante su recibo.
import { HttpError } from '../../shared/http-error.js';
import { requireActor } from '../matriculas/access.js';
import { confirmationContext } from './confirmation-context.js';
import { createConfirmationRepository, confirmationConflict } from './confirmation.repository.js';
import { confirmationInput, operationKey } from './confirmation.validation.js';
import { confirmationPlan, digest } from './confirmation-plan.js';
import { applyConfirmation } from './confirmation-effects.js';
import { peruDate } from '../../shared/peru-date.js';

export function createImportConfirmationService({ repository = createConfirmationRepository(),
  contextFor = confirmationContext, apply = applyConfirmation, getToday = peruDate } = {}) {
  const conflict = () => { throw new HttpError(409, 'El plan cambió. Revisa la vista previa y sus decisiones antes de confirmar.'); };
  const publicReceipt = (receipt, repeated) => ({ estado: 'CONFIRMADA', confirmacion_id: receipt.confirmacion_id,
    repetida: repeated, ...receipt.resultado });
  async function authorize(context, current, level) {
    requireActor(current, true, true);
    await context.reconcile.authorize(current, level);
  }
  return {
    async status(key, actor) {
      operationKey(key); requireActor(actor, true);
      return repository.transact(actor.id, async (connection, current) => {
        const context = contextFor(connection);
        await authorize(context, current);
        const receipt = await repository.receipt(connection, actor.id, key);
        if (!receipt) return { estado: 'SIN_CONFIRMACION_VERIFICADA' };
        await authorize(context, current, receipt.nivel);
        return publicReceipt(receipt, true);
      });
    },
    async confirm(id, body, actor, acquire) {
      const input = confirmationInput(body); requireActor(actor, true);
      const hash = digest([id, input]);
      let snapshot;
      try {
        return await repository.transact(actor.id, async (connection, current) => {
          const context = contextFor(connection);
          await authorize(context, current);
          // Recuperar primero el recibo evita repetir altas aunque la vista previa ya haya caducado.
          const receipt = await repository.receipt(connection, actor.id, input.clave_operacion);
          if (receipt) {
            await authorize(context, current, receipt.nivel);
            if (receipt.hash_solicitud !== hash) conflict();
            return publicReceipt(receipt, true);
          }
          snapshot = acquire();
          if (snapshot.version !== input.version_plan || JSON.stringify(snapshot.selected) !== JSON.stringify(input.filas)) conflict();
          await authorize(context, current, snapshot.selection.nivel);
          await repository.lockAcademic(connection, snapshot.plan);
          const today = getToday();
          const plan = await context.reconcile.prepare(snapshot.extracted, snapshot.selection, current);
          const view = confirmationPlan(id, { selected: input.filas, revision: snapshot.revision }, plan);
          if (!view.confirmacion_habilitada || view.version_plan !== input.version_plan) conflict();
          const phones = view.decisiones_telefono;
          if (phones.length !== input.decisiones_telefono.length
            || phones.some(phone => !input.decisiones_telefono.some(item => item.id_propuesta === phone.id_propuesta))) conflict();
          snapshot.assertFresh();
          if (getToday() !== today) conflict();
          // Los cambios y el recibo se guardan en la misma transacción.
          const resultado = await apply(connection, current, plan, input, context);
          snapshot.assertFresh();
          if (getToday() !== today) conflict();
          const saved = await repository.appendReceipt(connection, actor.id, { clave_operacion: input.clave_operacion,
            hash_solicitud: hash, nivel: snapshot.selection.nivel, resultado });
          return publicReceipt(saved, false);
        });
      } catch (error) { throw confirmationConflict(error); }
      finally { snapshot?.release(); }
    },
  };
}
