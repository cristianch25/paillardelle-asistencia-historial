import { renderMonthlyPdf } from './pdf.js';

export function createReportsController(service, render = renderMonthlyPdf) {
  return {
    async monthly(req, res) {
      const report = await service.monthly(req.query, req.authUser);
      const buffer = await render(report);
      res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="asistencia-${report.mes}-seccion-${report.section.id}.pdf"` });
      res.send(buffer);
    },
  };
}
