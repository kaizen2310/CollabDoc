const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const WebSocket = require('ws');
const { createServer } = require('../server');

const waitFor = async (predicate, timeoutMs = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for condition');
};

const createClient = (baseUrl, roomName) => {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(baseUrl, roomName, doc, { WebSocketPolyfill: WebSocket });
  return { doc, provider, text: doc.getText('content') };
};

test('synchronizes concurrent edits without diverging document state', async () => {
  const instance = await createServer({ port: 0 });
  const baseUrl = `ws://127.0.0.1:${instance.port}/collab`;
  const room = `room-${randomUUID()}-sync`;

  const clientA = createClient(baseUrl, room);
  const clientB = createClient(baseUrl, room);

  try {
    await waitFor(() => clientA.provider.wsconnected && clientB.provider.wsconnected);

    clientA.text.insert(0, 'A');
    clientB.text.insert(0, 'B');

    await waitFor(() => clientA.text.toString() === clientB.text.toString());
    const merged = clientA.text.toString();
    assert.equal(merged.length, 2);
    assert.ok(merged.includes('A'));
    assert.ok(merged.includes('B'));
  } finally {
    clientA.provider.destroy();
    clientB.provider.destroy();
    clientA.doc.destroy();
    clientB.doc.destroy();
    await instance.close();
  }
});

test('broadcasts live cursor awareness between connected collaborators', async () => {
  const instance = await createServer({ port: 0 });
  const baseUrl = `ws://127.0.0.1:${instance.port}/collab`;
  const room = `room-${randomUUID()}-presence`;

  const clientA = createClient(baseUrl, room);
  const clientB = createClient(baseUrl, room);

  try {
    await waitFor(() => clientA.provider.wsconnected && clientB.provider.wsconnected);

    clientA.provider.awareness.setLocalStateField('user', { name: 'Alice', color: '#123456' });
    clientA.provider.awareness.setLocalStateField('cursor', { index: 4 });

    await waitFor(() => {
      for (const [id, state] of clientB.provider.awareness.getStates()) {
        if (id === clientB.provider.awareness.clientID) {
          continue;
        }
        if (state?.user?.name === 'Alice' && state?.cursor?.index === 4) {
          return true;
        }
      }
      return false;
    });
  } finally {
    clientA.provider.destroy();
    clientB.provider.destroy();
    clientA.doc.destroy();
    clientB.doc.destroy();
    await instance.close();
  }
});
