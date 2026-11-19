import { PDFDocument } from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { drawMonthlyTable, fitText } from './pdf-table.js';

const crest = fileURLToPath(new URL('../../../../frontend/public/images/escudo-paillardelle.png', import.meta.url));
const levels = { INICIAL: 'Inicial', PRIMARIA: 'Primaria', SECUNDARIA: 'Secundaria' };

export function renderMonthlyPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 24, bufferPages: true,
      info: { Title: `Ficha mensual ${report.mes}`, Author: 'I.E. Enrique Paillardelle' } });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk)); doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    try {
      doc.image(crest, 27, 23, { fit: [42, 42] });
      doc.font('Helvetica-Bold').fontSize(16).text('I.E. Enrique Paillardelle', 78, 32, { width: 440, align: 'center' });
      const month = new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'UTC' })
        .format(new Date(`${report.mes}-01T00:00:00Z`)).toUpperCase();
      doc.fontSize(14).text(`REGISTRO DE ASISTENCIA ${report.section.anio} : ${month}`, 24, 67, { width: 547.28, align: 'center' });
      doc.font('Helvetica').fontSize(9).text(`Nivel: ${levels[report.section.nivel]}     Grado y sección: ${report.section.grado}${report.section.nivel === 'INICIAL' ? ' años' : '.º'} ${report.section.letra}`,
        24, 89, { width: 547.28 });
      const responsible = report.staff.map(person => `${person.cargo === 'DOCENTE' ? 'Docente' : person.cargo === 'AUXILIAR' ? 'Auxiliar' : 'Responsable'}: ${person.nombres} ${person.apellidos}`).join(' · ');
      fitText(doc, responsible || 'Responsable: sin asignación en el período', 24, 104, 547.28, 21, 8.5);
      const bottom = drawMonthlyTable(doc, report);
      doc.font('Helvetica').fontSize(8).text('. Presente   F Falta   J Falta justificada   T Tardanza   TJ Tardanza justificada', 24, bottom + 10, { width: 547.28 });
      doc.fontSize(7.5).text('Sombreado: día no lectivo. Celda vacía: sin marca guardada. Las marcas históricas se conservan.', 24, bottom + 22, { width: 547.28 });
      if (doc.bufferedPageRange().count !== 1) throw new Error('La ficha mensual excedió una hoja.');
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
