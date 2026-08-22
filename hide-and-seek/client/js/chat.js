// ============================================================================
// client/js/chat.js — Feature 5: text chat (lobby + in-game, team-split).
//
// One Chat instance drives both the lobby chat panel and the in-game chat
// overlay. It renders the server-relayed `chat:recv` stream and sends
// `chat:send` (the server enforces the length cap + per-player rate limit and
// splits the channel by team once a round is live).
// ============================================================================

import { EVENTS } from '../../shared/constants.js';

// A small built-in quick-message / emoji set shown above the input.
export const QUICK_MESSAGES = [
  '👋 hi', '🙈 hide!', '🔎 found one', '🚨 SOS', '📦 crate!',
  '🕶 cloaked', '💨 hurry', '👏 nice', '😂 lol', 'gg',
];

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export class Chat {
  /**
   * @param {object} o
   * @param {import('./net.js').Net} o.net
   * @param {import('./state.js').EventBus} o.bus
   * @param {HTMLElement} o.messages  container to append rendered messages to
   * @param {HTMLElement} o.input     the text input
   * @param {HTMLElement} o.sendBtn   the send button
   * @param {HTMLElement} o.quickWrap container that gets the quick-message buttons
   * @param {() => string} o.channelLabel returns 'LOBBY' or a team name, for headers
   * @param {() => string} o.getSelfId returns the current player id (to style own msgs)
   * @param {(channel: string) => boolean} o.showChannel true if this instance
   *        should render a message on the given channel ('lobby' | team name)
   */
  constructor({ net, bus, messages, input, sendBtn, quickWrap, channelLabel, getSelfId, showChannel }) {
    this.net = net;
    this.messages = messages;
    this.input = input;
    this._channelLabel = channelLabel;
    this.getSelfId = getSelfId || (() => null);
    // a chat instance renders only the channel it owns: the lobby panel shows
    // 'lobby' messages, the in-game overlay shows team messages. This keeps a
    // message from landing in BOTH boxes (both subscribe to chat:recv).
    this.showChannel = showChannel || (() => true);

    // server-relayed stream
    bus.on(`net:${EVENTS.CHAT_RECV}`, (m) => this.onRecv(m));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.send(input.value); }
    });
    sendBtn.addEventListener('click', () => this.send(input.value));
    if (quickWrap) {
      quickWrap.innerHTML = QUICK_MESSAGES.map((q, i) =>
        `<button type="button" class="chat-quick" data-q="${i}">${escapeHtml(q)}</button>`).join('');
      quickWrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-q]');
        if (!b) return;
        const msg = QUICK_MESSAGES[Number(b.dataset.q)];
        if (msg) this.send(msg);
      });
    }
    this._cap = 140;
  }

  /** Called by the store once room settings arrive. */
  setMaxLen(len) { if (Number.isFinite(len) && len > 0) this._cap = len; }

  send(text) {
    const clean = String(text ?? '').trim();
    if (!clean) return;
    this.net.send(EVENTS.CHAT_SEND, { text: clean.slice(0, this._cap) });
    this.input.value = '';
  }

  onRecv(m) {
    if (!this.showChannel(m.channel)) return;
    const isMe = m.id === this.getSelfId();
    const div = document.createElement('div');
    div.className = `chat-msg ${isMe ? 'me' : ''} ${m.channel === 'lobby' ? 'lobby' : 'team'}`;
    const who = `<span class="chat-who">${escapeHtml(m.name)}</span>`;
    const txt = `<span class="chat-text">${escapeHtml(m.text)}</span>`;
    div.innerHTML = `${who}${txt}`;
    this.messages.appendChild(div);
    while (this.messages.children.length > 60) this.messages.firstChild.remove();
    this.messages.scrollTop = this.messages.scrollHeight;
    return div;
  }

}
