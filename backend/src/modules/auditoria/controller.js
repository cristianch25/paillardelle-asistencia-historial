export function createAuditController(service) {
  return {
    async list(req, res) {
      res.json(await service.list(req.authUser, req.query));
    },
  };
}
