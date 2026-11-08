import { emitKeypressEvents } from 'node:readline';

// Solo terminal local interactiva. No admite contraseñas por argumentos o archivos.
export function readHiddenPassword(label, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(Object.assign(new Error(), { code: 'LOCAL_TERMINAL_REQUIRED' }));
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = Boolean(input.isRaw);
    emitKeypressEvents(input);

    function finish(error) {
      input.removeListener('keypress', onKey);
      input.removeListener('end', cancel);
      input.removeListener('error', cancel);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      const result = value;
      value = '';
      if (error) reject(error);
      else resolve(result);
    }

    function cancel() {
      finish(Object.assign(new Error(), { code: 'LOCAL_INPUT_CANCELLED' }));
    }

    function onKey(text, key = {}) {
      if (key.ctrl && ['c', 'd'].includes(key.name)) return cancel();
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = Array.from(value).slice(0, -1).join('');
      } else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f\x1b]/.test(text)) {
        value += text;
      }
    }

    input.on('keypress', onKey);
    input.once('end', cancel);
    input.once('error', cancel);
    input.setRawMode(true);
    output.write(label);
    input.resume();
  });
}
