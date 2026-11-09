export function createAniosEscolaresController(service) {
  return {
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
