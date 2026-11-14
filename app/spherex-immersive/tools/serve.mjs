// Dependency-free static server for local development.
//   node spherex-immersive/tools/serve.mjs [port]      (default 8810)
// It serves the WORKSPACE ROOT (the parent of this folder) because the app re-uses the shared data layer
// from ../spherex-explorer/js (read-only). "/" redirects to /spherex-immersive/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2]) || 8810;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(302, { Location: '/spherex-immersive/' }); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`SPHEREx Immersive Explorer: http://localhost:${port}/spherex-immersive/`));
