import { useEffect, useState } from 'react';
import axios from 'axios';
import type { AttendanceDetail } from '../asistencias.types';
import { useSupervisionCorrection } from '../supervision/useSupervisionCorrection';
import SupervisionCorrectionDialog from '../supervision/SupervisionCorrectionDialog';
import { getSearchCorrectionDetail } from './studentSearch.api';
import type { StudentSearchRow } from './studentSearch.types';
import { apiErrorMessage } from '../../../shared/api/apiError';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import Button from '../../../shared/components/Button';

export default function SearchCorrectionEditor({ row, onClose, onReload }: {
  row: StudentSearchRow; onClose: () => void; onReload: (message?: string) => void;
}) {
  const [data, setData] = useState<AttendanceDetail | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    Promise.resolve().then(() => current ? getSearchCorrectionDetail(row) : null).then(value => {
      if (current && value) setData(value);
    }).catch((failure: unknown) => {
      if (current && !axios.isCancel(failure)) setError(axios.isAxiosError(failure) ? apiErrorMessage(failure)
        : 'Los datos cambiaron o no corresponden a la selección. Actualiza los resultados antes de continuar.');
    });
    return () => { current = false; };
  }, [row]);
  if (error) return <><ErrorState message={error} /><Button variant="secondary" onClick={() => onReload()}>Actualizar resultados</Button></>;
  if (!data) return <LoadingState message="Comprobando asistencia seleccionada…" />;
  return <Correction initial={data} row={row} onClose={onClose} onReload={onReload} />;
}
function Correction({ initial, row, onClose, onReload }: {
  initial: AttendanceDetail; row: StudentSearchRow; onClose: () => void; onReload: (message?: string) => void;
}) {
  const correction = useSupervisionCorrection(initial);
  const [open, setOpen] = useState(true);
  const entry = correction.data.padron.find(item => item.asistencia_id === row.asistencia_id)!;
  if (open) return <SupervisionCorrectionDialog data={correction.data} row={entry} busy={correction.busy} onCancel={onClose}
    onSave={async (state, reason) => {
      const saved = await correction.save(entry.asistencia_id, state, reason);
      if (saved) onReload('Corrección guardada correctamente.');
      else setOpen(false);
    }} />;
  return <>
    {correction.error && <ErrorState message={correction.error} />}
    {correction.phase === 'review' || correction.phase === 'refreshing' ? <Button disabled={correction.busy} onClick={async () => {
      if (await correction.refresh()) onReload('Estado actual consultado. Revisa los datos antes de elegir otra corrección.');
    }}>Consultar estado actual</Button> : <Button variant="secondary" onClick={() => onReload()}>Reintentar detalle</Button>}
    {correction.phase === 'idle' && <Button variant="secondary" onClick={onClose}>Volver a resultados</Button>}
  </>;
}
