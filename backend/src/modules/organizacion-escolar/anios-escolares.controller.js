export function createAniosEscolaresController(service) {
  return {
    async list(req, res) {
      res.json(await service.list(req.query));
    },
    async findById(req, res) {
      res.json({ anio_escolar: await service.findById(req.params.id) });
    },
  };
}
