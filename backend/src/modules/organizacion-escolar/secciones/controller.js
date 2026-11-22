export function createSeccionesController(service) {
  return {
    async createBatch(req, res) {
      res.status(201).json({ secciones: await service.createBatch(req.body, req.authUser) });
    },
    async update(req, res) {
      res.json({ seccion: await service.update(req.params.id, req.body, req.authUser) });
    },
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
