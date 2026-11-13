export function createStudentsController(service) {
  return {
    async list(req, res) { res.json(await service.list(req.query, req.authUser)); },
    async create(req, res) { res.status(201).json(await service.create(req.body, req.authUser)); },
  };
}
