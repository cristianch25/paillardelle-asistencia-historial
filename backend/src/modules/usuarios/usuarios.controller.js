export function createUsuariosController(service) {
  return {
    async resetPassword(req, res) {
      res.json(await service.resetPassword(req.params.id, req.body, req.authUser.id));
    },
    async getAdditionalLevels(req, res) {
      res.json(await service.getAdditionalLevels(req.params.id));
    },
    async updateAdditionalLevels(req, res) {
      res.json(await service.updateAdditionalLevels(req.params.id, req.body, req.authUser.id));
    },
    async update(req, res) {
      res.json({ user: await service.update(req.params.id, req.body, req.authUser.id) });
    },
    async setState(req, res) {
      res.json({ user: await service.update(req.params.id, req.body, req.authUser.id, true) });
    },
    async create(req, res) {
      const user = await service.create(req.body, req.authUser.id);
      res.location(`/api/usuarios/${user.id}`).status(201).json({ user });
    },
    async list(req, res) {
      res.json(await service.list(req.query, req.authUser));
    },
    async findById(req, res) {
      res.json({ user: await service.findById(req.params.id, req.authUser) });
    },
  };
}
