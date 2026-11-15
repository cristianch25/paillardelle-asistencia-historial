export function createAttendanceController(service) {
  return {
    async open(req, res) {
      const result = await service.open(req.body, req.authUser);
      res.status(result.creada ? 201 : 200).json(result);
    },
    async find(req, res) { res.json(await service.find(req.params.id, req.query, req.authUser)); },
    async summary(req, res) { res.json(await service.find(req.params.id, req.query, req.authUser, true)); },
    async save(req, res) { res.json(await service.save(req.params.id, req.body, req.authUser)); },
    async close(req, res) { res.json(await service.close(req.params.id, req.body, req.authUser)); },
  };
}
