import { HttpError } from '../../shared/http-error.js';

export const tableLayout = { x: 24, y: 128, width: 547.28, names: 195, header: 44, row: 20.3 };

export function fitText(doc, text, x, y, width, height, size = 9, align = 'left') {
  let fontSize = size;
  while (fontSize >= 7) {
    doc.fontSize(fontSize);
    if (doc.heightOfString(text, { width, lineGap: 0 }) <= height) {
      doc.text(text, x, y, { width, height, align, lineGap: 0 }); return;
    }
    fontSize -= 0.25;
  }
  throw new HttpError(422, 'El texto de la ficha excede el espacio legible disponible. No se ha truncado información.');
}

export function drawMonthlyTable(doc, report) {
  const { x, y, width, names, header, row } = tableLayout;
  const column = (width - names) / report.days.length, bottom = y + header + 30 * row;
  doc.save().fillColor('#f3f3f3');
  for (const [index, day] of report.days.entries()) if (!day.es_lectivo) {
    doc.rect(x + names + index * column, y + 17, column, bottom - y - 17).fill();
  }
  doc.restore().font('Helvetica-Bold').fillColor('#111111');
  doc.fontSize(10).text('ESTUDIANTES', x + 4, y + 17, { width: names - 8, align: 'center' });
  const weeks = [...new Set(report.days.map(day => day.semana))];
  for (const week of weeks) {
    const start = report.days.findIndex(day => day.semana === week), count = report.days.filter(day => day.semana === week).length;
    doc.fontSize(7).text(count < 3 ? `S${week}` : `SEMANA ${week}`, x + names + start * column, y + 5,
      { width: count * column, align: 'center', lineBreak: false });
  }
  for (const [index, day] of report.days.entries()) {
    const left = x + names + index * column;
    doc.fontSize(7).text(day.dia, left, y + 20, { width: column, align: 'center', lineBreak: false });
    doc.fontSize(8).text(String(day.numero), left, y + 32, { width: column, align: 'center', lineBreak: false });
  }
  doc.strokeColor('#222222').lineWidth(0.4);
  for (let index = 0; index <= 30; index++) doc.moveTo(x, y + header + index * row).lineTo(x + width, y + header + index * row).stroke();
  for (const dy of [17, 30]) doc.moveTo(x + names, y + dy).lineTo(x + width, y + dy).stroke();
  doc.moveTo(x + 20, y + header).lineTo(x + 20, bottom).stroke();
  for (let index = 0; index <= report.days.length; index++) {
    const weekEdge = !index || index === report.days.length || report.days[index].semana !== report.days[index - 1].semana;
    doc.lineWidth(weekEdge ? 1 : 0.35).moveTo(x + names + index * column, y + (weekEdge ? 0 : 17))
      .lineTo(x + names + index * column, bottom).stroke();
  }
  doc.lineWidth(1).rect(x, y, width, bottom - y).stroke();
  for (const [index, student] of report.students.entries()) {
    const top = y + header + index * row;
    doc.font('Helvetica').fontSize(8).text(String(index + 1), x, top + 6, { width: 20, align: 'center', lineBreak: false });
    fitText(doc, student.nombre, x + 24, top + 2, names - 28, row - 3);
    for (const [dayIndex, symbol] of student.marcas.entries()) {
      const left = x + names + dayIndex * column;
      if (symbol === '.') doc.circle(left + column / 2, top + row / 2, 1.25).fill();
      else if (symbol) doc.font('Helvetica-Bold').fontSize(7.5).text(symbol, left, top + 6,
        { width: column, align: 'center', lineBreak: false });
    }
  }
  return bottom;
}
