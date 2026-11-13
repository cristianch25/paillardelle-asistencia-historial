export function createAssignmentsController(service) {
  return {
    async list(req, res) { res.json(await service.list(req.query, req.authUser)); },
    async create(req, res) { res.status(201).json({ asignacion: await service.create(req.body, req.authUser) }); },
  };
}
