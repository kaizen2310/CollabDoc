const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const WS_ROUTE_PREFIX = '/collab/';

const getDocNameFromRequest = (req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith(WS_ROUTE_PREFIX)) {
    return null;
  }

  const docName = decodeURIComponent(url.pathname.slice(WS_ROUTE_PREFIX.length));
  return docName || 'default';
};

const createServer = async ({ port = Number(process.env.PORT) || 3000 } = {}) => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  const wsServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const docName = getDocNameFromRequest(req);
    if (!docName) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(req, socket, head, (conn) => {
      setupWSConnection(conn, req, { docName });
    });
  });

  await new Promise((resolve) => server.listen(port, resolve));

  const close = async () => {
    wsServer.clients.forEach((client) => client.terminate());
    await new Promise((resolve) => wsServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  };

  return {
    app,
    server,
    wsServer,
    port: server.address().port,
    close
  };
};

if (require.main === module) {
  createServer().then(({ port }) => {
    process.stdout.write(`CollabDoc server listening on http://localhost:${port}\n`);
  });
}

module.exports = { createServer };
