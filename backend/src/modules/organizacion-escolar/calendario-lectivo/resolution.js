// Fechas civiles: UTC se usa solo para aritmética, sin convertir el día institucional.
const dayMilliseconds = 86400000;
export function daysBetween(start, end) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / dayMilliseconds + 1;
}

export function datesInRange(start, end) {
  return Array.from({ length: daysBetween(start, end) }, (_, index) =>
    new Date(Date.parse(`${start}T00:00:00Z`) + index * dayMilliseconds).toISOString().slice(0, 10));
}

export function effectiveDay(date, periods, exceptions) {
  const exception = exceptions.find(row => row.fecha === date);
  if (exception) return { fecha: date, es_lectivo: Boolean(exception.es_lectivo),
    origen: 'EXCEPCION', descripcion: exception.descripcion };
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const inPeriod = periods.some(row => row.fecha_inicio <= date && date <= row.fecha_fin);
  return { fecha: date, es_lectivo: inPeriod && weekday !== 0 && weekday !== 6,
    origen: inPeriod ? 'REGLA_SEMANAL' : 'FUERA_DE_PERIODO', descripcion: null };
}
