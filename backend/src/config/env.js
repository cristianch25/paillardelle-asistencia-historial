import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Ruta independiente del directorio desde el que se ejecute Node.js.
dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});
