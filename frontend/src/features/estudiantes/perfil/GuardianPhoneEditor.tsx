import { useId } from 'react';
import { Pencil } from 'lucide-react';
import Button from '../../../shared/components/Button';
import { useGuardianPhone } from './useGuardianPhone';

type Props = { studentId: string; phone: string | null; onBusyChange?: (busy: boolean) => void; onReload?: () => void };
export default function GuardianPhoneEditor({ studentId, phone, onBusyChange, onReload }: Props) {
  const state = useGuardianPhone(studentId, phone, onBusyChange), id = useId();
  return <div aria-label="Celular del apoderado" className="min-w-0 space-y-3">
    {state.phase === 'view' ? <div className="flex min-w-0 items-center gap-3">
      <p className="min-w-0 flex-1 break-all">{state.phone || 'Sin celular registrado'}</p>
      <Button variant="secondary" aria-label="Editar celular" onClick={state.edit} className="shrink-0"><Pencil aria-hidden="true" className="size-5" /></Button>
    </div> : state.phase === 'editing' || state.phase === 'previewing' ? <>
      <label htmlFor={id} className="block text-sm font-medium">Celular
        <input id={id} type="tel" inputMode="tel" autoComplete="tel" maxLength={64} value={state.input} disabled={state.busy}
          onChange={e => state.setInput(e.target.value)} className="mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void state.prepare()} disabled={state.busy}>Guardar número</Button>
        <Button variant="secondary" onClick={state.cancel} disabled={state.busy}>Cancelar</Button></div>
      {state.busy && <p role="status" className="text-sm">Revisando número…</p>}
    </> : state.phase === 'preview' || state.phase === 'saving' ? <section aria-label="Confirmar cambio de celular" className="space-y-3 rounded-lg bg-slate-50 p-3">
      <p className="break-words text-sm">Número actual: {state.preview?.telefono_actual || 'Sin celular registrado'}</p>
      <p className="break-words font-semibold">Nuevo número: {state.preview?.telefono_propuesto || 'Sin celular registrado'}</p>
      {state.preview?.afecta_otros_vinculos && <p className="text-sm">Este contacto está compartido. El nuevo número se reflejará también en otros estudiantes vinculados.</p>}
      <p className="text-sm">¿Confirmas el cambio del celular del apoderado?</p>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void state.confirm()} disabled={state.busy}>Confirmar cambio</Button>
        <Button variant="secondary" onClick={state.cancel} disabled={state.busy}>Cancelar</Button></div>
    </section> : <Button variant="secondary" onClick={onReload}>Consultar número actual</Button>}
    {state.message && <p role={state.phase === 'uncertain' || state.phase === 'editing' ? 'alert' : 'status'} className="break-words text-sm text-slate-700">{state.message}</p>}
  </div>;
}
