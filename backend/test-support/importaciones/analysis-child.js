// Exclusivamente fixtures ficticios. Nunca seleccionado por datos del usuario.
const mode = process.argv[2];
const ready = () => process.stdout.write(' '); // Espacio JSON, sin datos sensibles.
if (mode === 'block-start') { ready(); while (true) { /* Bloqueo intencional. */ } }
if (mode === 'crash') process.exit(7);
if (mode === 'invalid') { process.stdout.end('dato_privado'); setInterval(() => {}, 1000); }
if (mode === 'excess') { process.stdout.write(Buffer.alloc(4097, 120)); setInterval(() => {}, 1000); }
if (mode === 'no-read') { ready(); setInterval(() => {}, 1000); }
if (mode === 'block-end') {
  process.stdin.resume();
  process.stdin.on('end', () => { ready(); while (true) { /* Bloqueo tras la transferencia. */ } });
}
if (mode === 'invalid-exit') { process.stdin.resume(); process.stdin.on('end', () => process.stdout.end('{}')); }
if (mode === 'response-limit' || mode === 'response-limit-plus') {
  let bytes = 0;
  for await (const chunk of process.stdin) bytes += chunk.length;
  const json = JSON.stringify({ ok: true, bytes, sha256: 'a'.repeat(64) });
  process.stdout.end(json.padEnd(mode === 'response-limit' ? 4096 : 4097, ' '));
}
if (mode === 'stderr' || mode === 'result-stall') {
  if (mode === 'stderr') process.stderr.write('dato_privado');
  await import('../../src/modules/importaciones/analysis-process.js');
  if (mode === 'result-stall') setInterval(() => {}, 1000);
}
