import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const publicFile = name => new URL(`../public/${name}`, import.meta.url);
const manifest = JSON.parse(await readFile(publicFile('manifest.webmanifest'), 'utf8'));

test('manifiesto Android: identidad estable, apertura independiente y ruta de login existente', () => {
  assert.equal(manifest.name, 'Paillardelle Asistencia');
  assert.equal(manifest.id, '/'); assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/login'); assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.prefer_related_applications, false);
  assert.equal(manifest.lang, 'es-PE');
  const launch = new URL(manifest.start_url, 'https://paillardelle.example');
  assert.equal(launch.search, ''); assert.equal(launch.hash, '');
});

test('íconos PNG reales, opacos y cuadrados: 192/512 y variante maskable separada', async () => {
  assert.deepEqual(manifest.icons.map(icon => [icon.sizes, icon.purpose]),
    [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]);
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png'); assert.match(icon.src, /^\/icons\/[a-z0-9-]+\.png$/);
    const png = await readFile(publicFile(icon.src.slice(1)));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 2, 'RGB sin canal alfa: fondo opaco para instalación');
  }
});

test('HTML enlaza el manifiesto y conserva idioma, viewport y color institucional', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1.0"/);
  assert.match(html, /<html lang="es"/);
  assert.match(html, /<meta name="theme-color" content="#102c46"/);
  assert.match(html, /href="\/icons\/icon-192.png"/);
});
