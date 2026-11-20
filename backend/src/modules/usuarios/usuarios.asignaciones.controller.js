export function createAssignmentsController(service) {
  return {
    async finalize(req, res) {
      res.json({ asignacion: await service.finalize(req.params.id, req.body, req.authUser) });
    },
    async list(req, res) { res.json(await service.list(req.query, req.authUser)); },
    async create(req, res) { res.status(201).json({ asignacion: await service.create(req.body, req.authUser) }); },
  };
}
