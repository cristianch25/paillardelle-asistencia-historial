export function createEnrollmentController(service) {
  return {
    async list(req, res) { res.json(await service.list(req.query, req.authUser)); },
    async create(req, res) { res.status(201).json(await service.create(req.body, req.authUser)); },
    async joint(req, res) { res.status(201).json(await service.createJoint(req.body, req.authUser)); },
    async padron(req, res) { res.json(await service.padron(req.params.id, req.query, req.authUser)); },
    async withdraw(req, res) { res.json(await service.withdraw(req.params.id, req.body, req.authUser)); },
    async changeSection(req, res) { res.json(await service.changeSection(req.params.id, req.body, req.authUser)); },
    async retiredList(req, res) { res.json(await service.retiredList(req.params.id, req.authUser)); },
    async reingreso(req, res) { res.json(await service.reingreso(req.params.id, req.body, req.authUser)); },
  };
}
