import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { confirmImport, readImportOperation } from './confirmation.api';
import { importErrorMessage } from './importPresentation';
import ImportSummary from './ImportSummary';
import type { ImportPreview, ImportConfirmationInput, ImportReceipt, PhoneDecision } from './import.types';

type Props = { data: ImportPreview; disabled: boolean; onBlocking: (value: boolean) => void };
export default function ImportConfirmation({ data, disabled, onBlocking }: Props) {
  const [choices, setChoices] = useState<{ version?: string; values: PhoneDecision[] }>({ values: [] });
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''), [result, setResult] = useState<ImportReceipt | null>(null);
  const [operationKey, setOperationKey] = useState('');
  const operation = useRef<ImportConfirmationInput | null>(null), running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onBlocking(busy || uncertain); }, [busy, uncertain, onBlocking]);
  useUnsavedChanges('siagie-confirmation', uncertain, busy);
  const values = choices.version === data.version_plan ? choices.values : [];
  const phones = data.decisiones_telefono ?? [];
  const eligible = data.confirmacion_habilitada && data.version_plan && phones.every(phone => values.some(choice => choice.id_propuesta === phone.id_propuesta));
  async function submit() {
    if (running.current || !eligible || disabled || uncertain || result) return;
    const input: ImportConfirmationInput = { aceptar: true, version_plan: data.version_plan!, filas: data.filas_seleccionadas,
      clave_operacion: crypto.randomUUID(), decisiones_telefono: values };
    operation.current = input; setOperationKey(input.clave_operacion); running.current = true; onBlocking(true); setBusy(true); setError('');
    try { const saved = await confirmImport(data.id, input); if (alive.current) { setResult(saved); setReview(false); } }
    catch (cause) {
      if (alive.current) {
        const status = axios.isAxiosError(cause) ? cause.response?.status : undefined;
        const unknown = ![400, 401, 403, 404, 409, 413].includes(status ?? 0);
        setUncertain(unknown); setReview(false);
        setError(unknown ? 'Resultado incierto. Consulta el recibo antes de realizar otra operación.'
          : `${importErrorMessage(cause)} Actualiza la vista previa antes de confirmar nuevamente.`);
      }
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function consult() {
    if (running.current || !operation.current) return;
    running.current = true; setBusy(true);
    try {
      const saved = await readImportOperation(operation.current.clave_operacion);
      if (alive.current && saved.estado === 'CONFIRMADA') { setResult(saved); setUncertain(false); setError(''); }
      else if (alive.current) setError('Todavía no hay una confirmación verificada. No se ha repetido la escritura; vuelve a consultar.');
    } catch (cause) { if (alive.current) setError(importErrorMessage(cause)); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  if (!data.resumen_confirmacion || !data.version_plan) return <ImportSummary data={data} />;
  return <section aria-label="Confirmación de importación" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-xl font-bold">Confirmar importación</h2>
    <ImportSummary data={data} result={result} />
    {result ? <div role="status"><p>Importación confirmada</p>
      {(result.cantidades.telefonos ?? 0) > 0 && <p>Celulares actualizados: {result.cantidades.telefonos}</p>}
    </div> : <>
      {!data.confirmacion_habilitada && <p className="text-sm">Selecciona las filas válidas. Las filas pendientes se omitirán sin impedir las demás altas.</p>}
      {phones.map((phone, index) => <label key={phone.id_propuesta} className="block break-words text-sm">Celular de {phone.apoderado ?? `apoderado ${index + 1}`}: {phone.telefono_actual ?? 'Vacío'} → {phone.telefono_propuesto}
        {phone.afecta_otros_vinculos && <span className="block font-semibold">Este cambio afecta a otros estudiantes vinculados al mismo apoderado.</span>}
        <select aria-label={`Decisión para celular ${index + 1}`} className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
          disabled={disabled || busy || uncertain} value={values.find(choice => choice.id_propuesta === phone.id_propuesta)?.decision ?? ''}
          onChange={event => { setReview(false); setChoices({ version: data.version_plan, values: [...values.filter(choice => choice.id_propuesta !== phone.id_propuesta),
            ...(event.target.value ? [{ id_propuesta: phone.id_propuesta, decision: event.target.value as PhoneDecision['decision'] }] : [])] }); }}>
          <option value="">Revisar y decidir</option><option value="ACTUALIZAR">Actualizar al número propuesto</option><option value="CONSERVAR">Conservar el número existente</option>
        </select></label>)}
      {uncertain ? <><p className="break-all text-sm">Clave de operación: {operationKey}</p>
        <Button disabled={busy} onClick={() => void consult()}>Consultar resultado</Button></>
        : review ? <div aria-label="Aceptar confirmación" className="space-y-3"><p>¿Guardar las operaciones revisadas de las filas seleccionadas? Se conservarán los historiales y se aplicarán las decisiones de celular elegidas.</p>
          <div className="flex flex-wrap gap-3"><Button disabled={!eligible || disabled || busy} onClick={() => void submit()}>Confirmar y guardar</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setReview(false)}>Cancelar confirmación</Button></div></div>
          : <Button disabled={!eligible || disabled || busy} onClick={() => setReview(true)}>Confirmar importación</Button>}
    </>}
    {busy && <p role="status">Comprobando la operación…</p>}{error && <ErrorState message={error} />}
  </section>;
}
