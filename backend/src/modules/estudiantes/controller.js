export function createStudentsController(service) {
  return {
    async previewPhone(req, res) { res.json(await service.previewGuardianPhone(req.params.id, req.body, req.authUser)); },
    async confirmPhone(req, res) { res.json(await service.confirmGuardianPhone(req.params.id, req.body, req.authUser)); },
    async profile(req, res) { res.json(await service.profile(req.params.id, req.query, req.authUser)); },
    async list(req, res) { res.json(await service.list(req.query, req.authUser)); },
    async create(req, res) { res.status(201).json(await service.create(req.body, req.authUser)); },
  };
}
