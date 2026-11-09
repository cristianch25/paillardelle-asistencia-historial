export function createUsuariosController(service) {
  return {
    async list(req, res) {
      res.json(await service.list(req.query));
    },
    async findById(req, res) {
      res.json({ user: await service.findById(req.params.id) });
    },
  };
}
