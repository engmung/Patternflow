const OFFSCREEN_URL = 'offscreen.html';

let state = {
  running: false,
  connected: false,
  manual: false,
  tabTitle: '',
  host: 'patternflow.local',
  error: '',
  levels: [0, 0, 0, 0],
  outputs: [0, 0, 0, 0]
};

async function ensureOffscreen() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Analyze captured tab audio and send Patternflow knob values.'
  });
}

function broadcast() {
  chrome.runtime.sendMessage({ type: 'state', state }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'start') {
      await ensureOffscreen();
      state = {
        ...state,
        running: true,
        connected: false,
        manual: false,
        tabTitle: message.tabTitle || '',
        host: message.config.host,
        error: ''
      };
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'start',
        streamId: message.streamId,
        config: message.config
      });
      broadcast();
      sendResponse({ ok: true, state });
      return;
    }

    if (message.type === 'manual-connect') {
      await ensureOffscreen();
      state = {
        ...state,
        running: false,
        connected: false,
        manual: true,
        tabTitle: '',
        host: message.config.host,
        error: ''
      };
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'manual-connect',
        config: message.config
      });
      broadcast();
      sendResponse({ ok: true, state });
      return;
    }

    if (message.type === 'manual-value') {
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'manual-value',
        knob: message.knob,
        value: message.value
      }).catch(() => {});
      sendResponse({ ok: true, state });
      return;
    }

    if (message.type === 'stop') {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
      state = { ...state, running: false, connected: false, manual: false, error: '' };
      broadcast();
      sendResponse({ ok: true, state });
      return;
    }

    if (message.type === 'config') {
      state = { ...state, host: message.config.host };
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'config',
        config: message.config
      }).catch(() => {});
      broadcast();
      sendResponse({ ok: true, state });
      return;
    }

    if (message.type === 'release') {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'release' }).catch(() => {});
      sendResponse({ ok: true, state });
      return;
    }

    if (message.type === 'status') {
      sendResponse({ ok: true, state });
      return;
    }

    if (message.type === 'offscreen-state') {
      state = { ...state, ...message.patch };
      broadcast();
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message' });
  })().catch((error) => {
    state = { ...state, running: false, connected: false, error: String(error.message || error) };
    broadcast();
    sendResponse({ ok: false, error: state.error, state });
  });

  return true;
});
