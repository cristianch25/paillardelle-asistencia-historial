export function createAniosEscolaresController(service) {
  return {
    async close(req, res) {
      res.json({ anio_escolar: await service.close(req.params.id, req.body, req.authUser.id) });
    },
    async open(req, res) {
      res.json({ anio_escolar: await service.open(req.params.id, req.body, req.authUser.id) });
    },
    async create(req, res) {
      const year = await service.create(req.body, req.authUser.id);
      res.location(`/api/anios-escolares/${year.id}`).status(201).json({ anio_escolar: year });
    },
    async list(req, res) {
      res.json(await service.list(req.query));
    },
    async findById(req, res) {
      res.json({ anio_escolar: await service.findById(req.params.id) });
    },
  };
}
