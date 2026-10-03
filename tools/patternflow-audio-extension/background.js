// Patternflow Audio — service worker: a relay.
//
// The popup and the editor talk to this; the offscreen document does the work
// and owns the truth about it (offscreen.js: is a capture running, to which
// address, did the socket open, why did it end). Chrome puts this worker to
// sleep when it likes and wakes it with empty memory, so nothing is kept here
// that cannot be asked for again. `state` is a copy of the offscreen
// document's last word, there so a `status` request is answered without a
// round trip; after a wake it is fetched afresh before anyone is told it.

const OFFSCREEN_URL = 'offscreen.html';

const IDLE = {
  running: false,
  manual: false,
  connected: false,
  host: '',
  tabTitle: '',
  error: '',
  note: '',
  levels: [],
  pos: [],
  outputs: [],
  spectrum: [],
  env: [],
  autoRange: false
};

let state = { ...IDLE };
let heard = false;   // from the offscreen document, since this worker last woke

async function offscreenExists() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await offscreenExists()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Analyze captured tab audio and send Patternflow knob values.'
  });
}

function toOffscreen(message) {
  return chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
}

function take(patch) {
  if (!patch) return;
  state = { ...state, ...patch };
  heard = true;
}

// Make `state` worth telling. With no offscreen document nothing is running,
// whatever the copy says; after a wake the copy is empty and the document is
// asked.
async function refresh() {
  if (!(await offscreenExists())) {
    state = { ...IDLE };
    heard = true;
    return;
  }
  if (heard) return;
  const reply = await toOffscreen({ type: 'status' }).catch(() => null);
  take(reply && reply.state);
}

function broadcast() {
  chrome.runtime.sendMessage({ type: 'state', state }).catch(() => {});
}

// What the popup and the editor may ask the offscreen document to do. The
// message goes through as it came.
const COMMANDS = ['start', 'manual-connect', 'host', 'config', 'manual-value', 'release', 'stop'];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'offscreen-state') {
      take(message.patch);
      broadcast();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'status') {
      await refresh();
      sendResponse({ ok: true, state });
      return;
    }

    if (!COMMANDS.includes(message.type)) {
      sendResponse({ ok: false, error: 'Unknown message' });
      return;
    }

    // Only a start makes the document. Anything else with no document has
    // nothing to act on: a mapping saved in the editor while nothing runs, a
    // Stop pressed twice.
    if (message.type === 'start' || message.type === 'manual-connect') {
      await ensureOffscreen();
    } else if (!(await offscreenExists())) {
      await refresh();
      sendResponse({ ok: true, state });
      return;
    }

    const reply = await toOffscreen(message);
    if (!reply) throw new Error('The capture page did not answer.');
    take(reply.state);
    if (message.type !== 'manual-value') broadcast();
    sendResponse({ ok: reply.ok !== false, error: reply.error, state });
  })().catch((failure) => {
    sendResponse({ ok: false, error: String(failure.message || failure), state });
  });

  return true;
});
