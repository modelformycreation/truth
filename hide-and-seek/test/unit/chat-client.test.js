// ============================================================================
// Regression tests — Feature 5 client chat: channel filtering.
//
// Both the lobby panel and the in-game overlay subscribe to the SAME
// server-relayed `chat:recv` event. If they both rendered every message, a
// lobby message would leak into the in-game chat box (and vice-versa), and —
// more importantly — the in-game box would render cross-team messages it must
// never show. Each instance therefore renders ONLY the channel it owns:
//   • lobby panel → 'lobby' channel only
//   • in-game overlay → team channels only (NOT 'lobby')
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../client/js/state.js';
import { Chat } from '../../client/js/chat.js';

// minimal DOM so Chat can create message <div>s under node:test
if (!globalThis.document) {
  globalThis.document = {
    createElement: () => ({
      innerHTML: '', className: '', classList: { toggle() {} },
      appendChild() {}, remove() {},
    }),
  };
}

function fakeDom() {
  const messages = {
    children: [],
    appendChild(c) { this.children.push(c); this.last = c; },
    firstChild: null, scrollTop: 0, scrollHeight: 0,
  };
  const input = { value: '', addEventListener() {} };
  const btn = { addEventListener() {} };
  const quick = { innerHTML: '', addEventListener() {} };
  return { messages, input, btn, quick };
}

function mkChat(bus, dom, showChannel) {
  return new Chat({
    net: { send() {} }, bus,
    messages: dom.messages, input: dom.input, sendBtn: dom.btn, quickWrap: dom.quick,
    channelLabel: () => 'LOBBY', getSelfId: () => 'p1', showChannel,
  });
}

const emit = (bus, m) => bus.emit('net:chat:recv', m);

test('the lobby panel renders only lobby-channel messages', () => {
  const bus = new EventBus();
  const dom = fakeDom();
  mkChat(bus, dom, (ch) => ch === 'lobby');
  emit(bus, { id: 'p2', name: 'Bob', text: 'hello', channel: 'lobby' });
  emit(bus, { id: 'p2', name: 'Bob', text: 'team secret', channel: 'HIDERS' });
  assert.equal(dom.messages.children.length, 1, 'only the lobby message is shown');
  assert.match(dom.messages.children[0].innerHTML, /hello/);
});

test('the in-game overlay renders only team messages, never lobby', () => {
  const bus = new EventBus();
  const dom = fakeDom();
  mkChat(bus, dom, (ch) => ch !== 'lobby');
  emit(bus, { id: 'p2', name: 'Bob', text: 'lobby filler', channel: 'lobby' });
  emit(bus, { id: 'p2', name: 'Bob', text: 'team secret', channel: 'HIDERS' });
  assert.equal(dom.messages.children.length, 1, 'only the team message is shown');
  assert.match(dom.messages.children[0].innerHTML, /team secret/);
});

test('the in-game overlay renders only MY team, not the enemy team', () => {
  const bus = new EventBus();
  const dom = fakeDom();
  // a hider watching the overlay: show only 'HIDERS' channel messages
  mkChat(bus, dom, (ch) => ch === 'HIDERS');
  emit(bus, { id: 'p3', name: 'Enemy', text: 'im coming', channel: 'SEEKERS' });
  emit(bus, { id: 'p2', name: 'Ally', text: 'im hidden', channel: 'HIDERS' });
  assert.equal(dom.messages.children.length, 1);
  assert.match(dom.messages.children[0].innerHTML, /im hidden/);
  assert.doesNotMatch(dom.messages.children[0].innerHTML, /im coming/);
});
