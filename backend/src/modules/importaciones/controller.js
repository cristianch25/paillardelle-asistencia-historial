import { HttpError } from '../../shared/http-error.js';
import { receiveXlsxUpload } from './upload.js';

export function createImportPreviewController(service) {
  return {
    confirm: async (req, res) => res.json(await service.confirm(req.params.id, req.body, req.authUser)),
    status: async (req, res) => res.json(await service.status(req.params.clave_operacion, req.authUser)),
    levels: async (req, res) => res.json(await service.levels(req.authUser)),
    get: async (req, res) => res.json(await service.get(req.params.id, req.query, req.authUser)),
    select: async (req, res) => res.json(await service.select(req.params.id, req.body, req.authUser)),
    correctPhone: async (req, res) => res.json(await service.correctPhone(req.params.id, req.params.fila_id, req.body, req.authUser)),
    async load(req, res) {
      const reservation = await service.begin(req.query, req.authUser);
      const controller = new AbortController();
      const abort = () => { if (!res.writableEnded) controller.abort(); };
      const timer = setTimeout(() => controller.abort(), 60_000); timer.unref();
      req.once('aborted', abort); res.once('close', abort);
      try {
        const bytes = await receiveXlsxUpload(req, { signal: controller.signal });
        res.status(201).json(await service.load(reservation, bytes, req.authUser, controller.signal));
      } catch (error) {
        service.discard(reservation.id);
        if (controller.signal.aborted) throw new HttpError(408, 'La carga se interrumpió o superó el plazo. Intenta nuevamente.');
        throw error;
      } finally { clearTimeout(timer); req.off('aborted', abort); res.off('close', abort); }
    },
  };
}
