# CollabDoc

A minimal real-time collaborative document editor with:

- multi-user simultaneous editing via Yjs CRDT sync
- low-latency WebSocket propagation
- live collaborator cursor presence

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser windows (or two different browsers), keep the same document id, and edit simultaneously.

## Test

```bash
npm test
```
