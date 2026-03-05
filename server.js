const http = require('http');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function proxifyHtml(html, baseUrl) {
  return html
    .replace(/(href|src)=("|')([^"'#]+)("|')/gi, (_, attr, q1, value, q2) => {
      if (/^(data:|javascript:|mailto:|tel:)/i.test(value)) return `${attr}=${q1}${value}${q2}`;
      try {
        const absolute = new URL(value, baseUrl).toString();
        return `${attr}=${q1}/proxy?url=${encodeURIComponent(absolute)}${q2}`;
      } catch {
        return `${attr}=${q1}${value}${q2}`;
      }
    })
    .replace(/<form([^>]*?)action=("|')([^"']+)("|')([^>]*)>/gi, (_, before, q1, action, q2, after) => {
      try {
        const absolute = new URL(action, baseUrl).toString();
        return `<form${before}action=${q1}/proxy?url=${encodeURIComponent(absolute)}${q2} method="GET"${after}>`;
      } catch {
        return `<form${before}action=${q1}${action}${q2}${after}>`;
      }
    });
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function streamZip(res) {
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="cartoon-proxy-project.zip"'
  });

  const zip = spawn('zip', ['-r', '-', '.', '-x', '.git/*', 'node_modules/*', '*.zip'], { cwd: ROOT_DIR });

  zip.stdout.pipe(res);
  zip.stderr.on('data', () => {});

  zip.on('close', (code) => {
    if (code !== 0) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Failed to build zip archive.');
    }
  });
}

async function handleProxy(reqUrl, res) {
  const target = normalizeUrl(reqUrl.searchParams.get('url'));

  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Missing or invalid "url" query parameter.');
    return;
  }

  try {
    const response = await fetch(target, {
      headers: { 'user-agent': 'BookishUmbrella-Proxy/1.0' },
      redirect: 'follow'
    });

    if (!response.ok) {
      res.writeHead(response.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Failed to load target URL: ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    if (contentType.includes('text/html')) {
      const html = await response.text();
      const rewritten = proxifyHtml(html, response.url);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(rewritten);
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(Buffer.from(arrayBuffer));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Proxy error: ${error.message}`);
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  if (req.method === 'GET' && reqUrl.pathname === '/proxy') {
    handleProxy(reqUrl, res);
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/download/project') {
    streamZip(res);
    return;
  }

  const safePath = reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  serveFile(filePath, res);
});

server.listen(PORT, () => {
  console.log(`Cartoon proxy is running at http://localhost:${PORT}`);
});
