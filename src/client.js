import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const editor = document.getElementById('editor');
const docInput = document.getElementById('doc-id');
const nameInput = document.getElementById('name');
const joinButton = document.getElementById('join');
const status = document.getElementById('status');
const cursorLayer = document.getElementById('cursor-layer');
const presence = document.getElementById('presence');

const charMetrics = (() => {
  const probe = document.createElement('span');
  probe.textContent = 'M';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.font = getComputedStyle(editor).font;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width || 8;
  document.body.removeChild(probe);

  const style = getComputedStyle(editor);
  const parsedLineHeight = Number.parseFloat(style.lineHeight);
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  return {
    charWidth: width,
    lineHeight: Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.4
  };
})();

const randomColor = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
const uniqueSuffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.floor(Math.random() * 1e9).toString(36);
const defaultName = `User-${uniqueSuffix}`;
nameInput.value = defaultName;

let provider;
let ydoc;
let ytext;
let applyingRemote = false;
let cleanupTextObserver = () => {};

const cursorToCoordinates = (value, cursorIndex) => {
  const safeIndex = Math.max(0, Math.min(cursorIndex, value.length));
  const leftPadding = Number.parseFloat(getComputedStyle(editor).paddingLeft) || 0;
  const topPadding = Number.parseFloat(getComputedStyle(editor).paddingTop) || 0;
  const lines = value.slice(0, safeIndex).split('\n');
  const row = lines.length - 1;
  const col = lines[lines.length - 1].length;

  return {
    left: leftPadding + col * charMetrics.charWidth - editor.scrollLeft,
    top: topPadding + row * charMetrics.lineHeight - editor.scrollTop
  };
};

const updatePresenceSummary = () => {
  const entries = [];
  provider?.awareness.getStates().forEach((state, clientId) => {
    if (clientId !== provider.awareness.clientID && state?.user?.name) {
      entries.push(state.user.name);
    }
  });
  presence.textContent = entries.length
    ? `Active collaborators: ${entries.join(', ')}`
    : 'Active collaborators: none';
};

const renderRemoteCursors = () => {
  cursorLayer.replaceChildren();
  if (!provider) {
    return;
  }

  const value = editor.value;
  provider.awareness.getStates().forEach((state, clientId) => {
    if (clientId === provider.awareness.clientID || !state?.cursor || !state?.user) {
      return;
    }

    const { top, left } = cursorToCoordinates(value, state.cursor.index);
    const cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.style.top = `${top}px`;
    cursor.style.left = `${left}px`;
    cursor.style.height = `${charMetrics.lineHeight}px`;
    cursor.style.borderColor = state.user.color;

    const label = document.createElement('div');
    label.className = 'remote-cursor-label';
    label.style.backgroundColor = state.user.color;
    label.textContent = state.user.name;
    cursor.appendChild(label);
    cursorLayer.appendChild(cursor);
  });

  updatePresenceSummary();
};

const publishLocalCursor = () => {
  if (!provider) {
    return;
  }
  provider.awareness.setLocalStateField('cursor', { index: editor.selectionStart });
  renderRemoteCursors();
};

const applyRemoteText = () => {
  if (!ytext) {
    return;
  }

  applyingRemote = true;
  const localCursor = editor.selectionStart;
  editor.value = ytext.toString();
  const nextCursor = Math.min(localCursor, editor.value.length);
  editor.setSelectionRange(nextCursor, nextCursor);
  applyingRemote = false;
  renderRemoteCursors();
};

const bindDocumentSync = () => {
  editor.addEventListener('input', () => {
    if (!ytext || !ydoc || applyingRemote) {
      return;
    }

    const nextValue = editor.value;
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, nextValue);
    }, 'local-input');
    publishLocalCursor();
  });

  ['keyup', 'click', 'select', 'focus'].forEach((eventName) => {
    editor.addEventListener(eventName, publishLocalCursor);
  });
  editor.addEventListener('scroll', renderRemoteCursors);
};

const connect = () => {
  cleanupTextObserver();
  provider?.destroy();
  ydoc?.destroy();

  ydoc = new Y.Doc();
  ytext = ydoc.getText('content');
  const observer = () => applyRemoteText();
  ytext.observe(observer);
  cleanupTextObserver = () => ytext?.unobserve(observer);

  const docName = docInput.value.trim() || 'shared-doc';
  const wsOrigin = window.location.origin.replace(/^http/, 'ws') + '/collab';
  provider = new WebsocketProvider(wsOrigin, docName, ydoc);

  provider.on('status', (event) => {
    status.textContent = event.status;
  });

  provider.awareness.setLocalStateField('user', {
    name: nameInput.value.trim() || defaultName,
    color: randomColor()
  });

  provider.awareness.on('change', renderRemoteCursors);
  applyRemoteText();
  publishLocalCursor();
};

bindDocumentSync();
joinButton.addEventListener('click', connect);
connect();
