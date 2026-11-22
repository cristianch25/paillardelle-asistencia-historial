export function createAssignmentsController(service) {
  return {
    async registrars(req, res) { res.json(await service.catalog('registrars', req.authUser, req.query)); },
    async sections(req, res) { res.json(await service.catalog('sections', req.authUser, req.query)); },
    async finalize(req, res) {
      res.json({ asignacion: await service.finalize(req.params.id, req.body, req.authUser) });
    },
    async list(req, res) { res.json(await service.list(req.query, req.authUser)); },
    async create(req, res) {
      const result = await service.create(req.body, req.authUser);
      res.status(201).json(Array.isArray(result) ? { asignaciones: result } : { asignacion: result });
    },
  };
}
