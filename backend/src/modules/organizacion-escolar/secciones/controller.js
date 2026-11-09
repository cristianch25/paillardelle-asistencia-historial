export function createSeccionesController(service) {
  return {
    async list(req, res) { res.json(await service.list(req.query, req.authUser)); },
    async findById(req, res) {
      res.json({ seccion: await service.findById(req.params.id, req.authUser) });
    },
    async create(req, res) {
      const section = await service.create(req.body, req.authUser);
      res.location(`/api/secciones/${section.id}`).status(201).json({ seccion: section });
    },
  };
}
