export const printFailureMessage = 'No se pudo abrir la impresión. Descarga la ficha e imprímela desde tu visor PDF.';

// El mismo PDF se carga en el visor nativo; no se transforma ni se vuelve a generar.
export function printPdf(blob: Blob): { ready: Promise<void>; dispose: () => void } {
  if (navigator.pdfViewerEnabled === false) throw new Error(printFailureMessage);
  const url = URL.createObjectURL(blob), frame = document.createElement('iframe');
  let disposed = false, requested = false, timer = 0;
  let rejectReady: (reason: Error) => void = () => {};
  function dispose() {
    if (disposed) return;
    disposed = true;
    window.clearTimeout(timer);
    frame.onload = null; frame.onerror = null;
    frame.remove(); URL.revokeObjectURL(url);
    rejectReady(new Error(printFailureMessage));
  }
  const ready = new Promise<void>((resolve, reject) => {
    rejectReady = reject;
    frame.title = 'Ficha mensual para imprimir';
    frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;';
    frame.onload = () => {
      if (disposed || requested) return;
      requested = true; window.clearTimeout(timer);
      try {
        const viewer = frame.contentWindow;
        if (!viewer) throw new Error(printFailureMessage);
        // Esperar a salir de la vista de impresión antes de liberar el documento.
        viewer.addEventListener('afterprint', () => window.setTimeout(dispose, 0), { once: true });
        viewer.focus(); viewer.print(); resolve();
      } catch { dispose(); }
    };
    frame.onerror = dispose;
    timer = window.setTimeout(dispose, 30000);
    frame.src = url;
    document.body.append(frame);
  });
  // Si el visor no emite afterprint, se libera al salir o iniciar otra acción.
  return { ready, dispose };
}
