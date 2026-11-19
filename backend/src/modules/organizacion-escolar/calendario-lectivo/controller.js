export function createCalendarController(service) {
  return {
    async listPeriods(req, res) { res.json(await service.listPeriods(req.query, req.authUser)); },
    async findPeriod(req, res) { res.json({ periodo_lectivo: await service.findPeriod(req.params.id, req.authUser) }); },
    async createPeriod(req, res) {
      const row = await service.createPeriod(req.body, req.authUser);
      res.location(`/api/periodos-lectivos/${row.id}`).status(201).json({ periodo_lectivo: row });
    },
    async updatePeriod(req, res) {
      res.json({ periodo_lectivo: await service.updatePeriod(req.params.id, req.body, req.authUser) });
    },
    async effectiveCalendar(req, res) { res.json(await service.effectiveCalendar(req.query, req.authUser)); },
    async listExceptions(req, res) { res.json(await service.listExceptions(req.query, req.authUser)); },
    async putException(req, res) {
      const result = await service.putException(req.params, req.body, req.authUser);
      res.json(Array.isArray(result) ? { excepciones: result } : { excepcion: result });
    },
    async blockRange(req, res) { res.json({ excepciones: await service.blockRange(req.body, req.authUser) }); },
  };
}
