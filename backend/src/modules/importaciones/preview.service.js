import { createImportReconciliationService } from './reconciliation.service.js';
import { createPreviewStore } from './preview-store.js';
import { runAnalysis } from './analysis-runner.js';
import { previewSelection, previewPage, validateFileLevel, selectedRows } from './preview-validation.js';
import { previewResponse } from './preview-response.js';
import { eligiblePreviewIds } from './preview-eligibility.js';
import { HttpError } from '../../shared/http-error.js';
import { correctedExtraction, sourceRowId, temporaryPhone, canCorrectPhone } from './preview-phone.js';
import { createImportConfirmationService } from './confirmation.service.js';
import { copyConfirmationPlan } from './confirmation-plan.js';

export function createImportPreviewService({ reconcile = createImportReconciliationService(),
  store = createPreviewStore(), analyze = runAnalysis, confirmation = createImportConfirmationService() } = {}) {
  async function currentPlan(id, actor) {
    const stored = store.get(id, actor.id);
    if (stored.confirming) throw new HttpError(409, 'Hay una confirmación en curso. Consulta su resultado.');
    const revision = stored.revision, extracted = correctedExtraction(stored);
    await reconcile.authorize(actor, stored.selection.nivel);
    const plan = await reconcile.prepare(extracted, stored.selection, actor);
    store.get(id, actor.id); // No entregar una vista que caducó durante las lecturas.
    if (stored.revision !== revision) throw new HttpError(409, 'La vista previa cambió. Vuelve a consultar antes de corregir.');
    const allowed = new Set(eligiblePreviewIds(plan));
    stored.selected = stored.selected.filter(key => allowed.has(key));
    return { stored, plan, revision };
  }
  function unchanged(stored, revision) {
    if (stored.confirming || stored.revision !== revision) throw new HttpError(409, 'La vista previa cambió. Vuelve a consultar antes de corregir.');
  }
  return {
    status: (key, actor) => confirmation.status(key, actor),
    confirm(id, body, actor) {
      return confirmation.confirm(id, body, actor, () => {
        const stored = store.get(id, actor.id);
        if (stored.confirming || !stored.reviewed) throw new HttpError(409, 'Revisa la vista previa antes de confirmar.');
        stored.confirming = true;
        return { version: stored.reviewed.version, plan: copyConfirmationPlan(stored.reviewed.plan),
          selected: [...stored.selected].sort(), revision: stored.revision,
          selection: structuredClone(stored.selection), extracted: structuredClone(correctedExtraction(stored)),
          assertFresh() { store.get(id, actor.id); }, release() { stored.confirming = false; } };
      });
    },
    async levels(actor) { return { niveles: (await reconcile.authorize(actor)).levels }; },
    async begin(query, actor) {
      const selection = previewSelection(query);
      await reconcile.authorize(actor, selection.nivel, selection);
      return { id: store.reserve(actor.id), selection };
    },
    async load(reservation, bytes, actor, signal) {
      try {
        const extracted = await analyze(bytes, { signal });
        validateFileLevel(extracted, reservation.selection.nivel);
        const plan = await reconcile.prepare(extracted, reservation.selection, actor);
        signal?.throwIfAborted();
        store.complete(reservation.id, actor.id, { extracted, selection: reservation.selection, selected: eligiblePreviewIds(plan),
          phoneCorrections: new Map(), revision: 1 });
        return previewResponse(reservation.id, store.get(reservation.id, actor.id), plan, { page: 1, limit: 20, offset: 0 });
      } catch (error) { store.remove(reservation.id); throw error; }
      finally { bytes.fill(0); }
    },
    discard: id => store.remove(id),
    async get(id, query, actor) {
      const page = previewPage(query), { stored, plan, revision } = await currentPlan(id, actor);
      unchanged(stored, revision);
      return previewResponse(id, stored, plan, page);
    },
    async select(id, body, actor) {
      const { stored, plan, revision } = await currentPlan(id, actor);
      unchanged(stored, revision);
      stored.selected = selectedRows(body, plan);
      stored.reviewed = null;
      return { filas_seleccionadas: stored.selected, confirmacion_habilitada: false };
    },
    async correctPhone(id, rowId, body, actor) {
      const phone = temporaryPhone(body), { stored, plan, revision } = await currentPlan(id, actor);
      unchanged(stored, revision);
      const source = stored.extracted.registros.find(row => sourceRowId(row) === rowId);
      const row = plan.registros.find(row => row.id === rowId);
      if (!source || !row) throw new HttpError(404, 'Fila no encontrada en esta vista previa.');
      if (!canCorrectPhone(source, row, stored.extracted.registros)) {
        throw new HttpError(409, 'El apoderado o su vínculo requiere revisión antes de corregir el celular.');
      }
      if ((stored.phoneCorrections.get(rowId)?.version ?? 1) !== body.version) {
        throw new HttpError(409, 'La fila cambió. Consulta la vista previa y vuelve a corregir.');
      }
      const corrections = new Map(stored.phoneCorrections);
      corrections.set(rowId, { telefono: phone, version: body.version + 1 });
      const next = await reconcile.prepare(correctedExtraction(stored, corrections), stored.selection, actor);
      await reconcile.authorize(actor, stored.selection.nivel);
      store.get(id, actor.id);
      unchanged(stored, revision);
      stored.phoneCorrections = corrections; stored.revision++;
      const allowed = new Set(eligiblePreviewIds(next));
      stored.selected = stored.selected.filter(key => allowed.has(key));
      const offset = Math.floor(next.registros.findIndex(row => row.id === rowId) / 20) * 20;
      return previewResponse(id, stored, next, { page: offset / 20 + 1, limit: 20, offset });
    },
  };
}
