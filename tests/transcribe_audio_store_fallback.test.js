const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Blob } = require('buffer');

async function run() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const acceleratedTimeouts = new Set();

update-timeout-handling-in-page-store-readiness-etx9o8
  const fakeTimeouts = new Map();
  let fakeTimeoutId = 1;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  global.setTimeout = (fn, delay, ...args) => {
    if (delay === 2000) {
      const id = fakeTimeoutId++;
      fakeTimeouts.set(id, { fn, args, cleared: false });
      process.nextTick(() => {
        const entry = fakeTimeouts.get(id);
        if (!entry || entry.cleared) {
          return;
        }
        fakeTimeouts.delete(id);
        entry.fn(...entry.args);
      });
      return id;
    }

    return originalSetTimeout(fn, delay, ...args);
  };

  global.clearTimeout = (id) => {
    if (fakeTimeouts.has(id)) {
      fakeTimeouts.get(id).cleared = true;
      fakeTimeouts.delete(id);
      return;
    }

    return originalClearTimeout(id);
  };

  const window = {};
  global.window = window;
  window.window = window;
  window.__uiUpdate = () => {};

  try {
    window.postMessage = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      if (payload.type === 'WA_STORE_REQUEST') {
        setImmediate(() => {
          messageHandlers.forEach((handler) => {
            handler({
              source: window,
              data: {
                type: 'WA_STORE_RESPONSE',
                requestId: payload.requestId,
                success: true,
                blob: storeBlob,
                metadata: { mimeType: 'audio/ogg', fileName: 'from-store.ogg' }
              }
            });
          });
        });
      }
    };

    window.addEventListener = (type, handler) => {
      if (type === 'message' && typeof handler === 'function') {
        messageHandlers.add(handler);
      }
    };

    window.removeEventListener = (type, handler) => {
      if (type === 'message') {
        messageHandlers.delete(handler);
      }
    };

    const fakeScriptNodes = [];


    global.document = {
      readyState: 'loading',
      addEventListener: () => {},
      documentElement: {
        appendChild(node) {
          fakeScriptNodes.push(node);
          if (typeof node.onload === 'function') {
            node.onload();
          }
        }
      },
      createElement(tag) {
        if (tag === 'script') {
          return {
            tagName: 'SCRIPT',
            async: false,
            set src(value) {
              this._src = value;
            },
            get src() {
              return this._src;
            },
            setAttribute() {},
            remove() {
              this._removed = true;
            },
            onload: null,
            onerror: null,
            parentNode: {
              removeChild() {}
            }
          };
        }

        return {
          tagName: tag.toUpperCase(),
          classList: { add() {}, remove() {} },
          style: {},
          setAttribute() {},
          appendChild() {},
          remove() {},
          querySelector: () => null,
          querySelectorAll: () => []
        };
      },
      body: { appendChild() {} }
    };
update-timeout-handling-in-page-store-readiness-etx9o8

    global.chrome = {
      runtime: {
        getURL: (target) => target,
        sendMessage: async () => ({ ok: true, text: 'transcribed-text' }),
        onMessage: { addListener: () => {} }
      },
      storage: { sync: { get: async () => ({}) } }
    };

    global.MutationObserver = class {
      constructor() {}
      observe() {}
      disconnect() {}
    };

    global.fetch = async () => {
      throw new Error('fetch não deve ser chamado durante o teste');
    };

    global.console = console;
    global.Blob = Blob;

    const scriptContent = fs.readFileSync(
      path.join(__dirname, '..', 'whatsapp-ai-extension', 'content.js'),
      'utf8'
    );

    vm.runInThisContext(scriptContent, { filename: 'content.js' });

    const helpers = window.__zapStoreHelpers;
    assert.ok(helpers, 'Helpers do Store devem estar disponíveis globalmente');

    const elementWithId = {
      dataset: { id: 'message-data-url' },
      parentElement: null,
      getAttribute: () => null
    };

    assert.strictEqual(
      helpers.getMessageIdFromElement(elementWithId),
      'message-data-url',
      'getMessageIdFromElement deve extrair id da mensagem'
    );

    const messageElement = {
      dataset: { id: 'message-data-url' },
      querySelectorAll: () => [],
      querySelector: () => null,
      getAttribute: () => null,
      parentElement: null
    };

    const AssistantClass =
      global.WhatsAppAIAssistant ||
      window.WhatsAppAIAssistant ||
      vm.runInThisContext('typeof WhatsAppAIAssistant !== "undefined" ? WhatsAppAIAssistant : undefined');
    assert.ok(AssistantClass, 'Classe WhatsAppAIAssistant deve estar disponível');

    // Cenário 1: readiness expira e DOM fornece o blob
    const domBlob = new Blob(['audio-from-dom']);
    let domLookupCount = 0;

    const assistantDomContext = {
      findPlayableAudioElementWithin: () => null,
      ensureAudioReady: async () => {},
      fetchBlobFromAudioElement: async () => {
        throw new Error('Não deve buscar blob direto no DOM da mensagem');
      },
      fetchBlobFromUrl: async () => {
        throw new Error('Não deve reutilizar URL anterior');
      },
      getLastVoiceBlob: async () => {
        domLookupCount += 1;
        return { blob: domBlob, audioElement: { currentSrc: 'dom-src' } };
      },
      lastKnownAudioSrc: null,
      transcribeBlobWithWhisper: async (blob, mimeType) => {
        const buffer = Buffer.from(await blob.arrayBuffer());
        assert.strictEqual(buffer.toString(), 'audio-from-dom');
        assert.strictEqual(mimeType, 'audio/ogg');
        return 'dom-transcribed';
      }
    };

    const transcriptionDom = await AssistantClass.prototype.transcribeAudio.call(
      assistantDomContext,
      messageElement
    );

    assert.strictEqual(transcriptionDom, 'dom-transcribed');
    assert.strictEqual(domLookupCount, 1, 'Deve buscar blob no DOM após timeout do Store');
    assert.strictEqual(
      window.__zapPageStoreReady === true,
      false,
      'Store não deve sinalizar readiness quando timeout ocorre'
    );

    window.__zapPageStoreReady = false;

    // Cenário 2: DOM falha e fallback final via Store funciona após readiness
    let storeResponses = 0;
    let domFailures = 0;

    const assistantStoreContext = {
      findPlayableAudioElementWithin: () => null,
      ensureAudioReady: async () => {},
      fetchBlobFromAudioElement: async () => {
        throw new Error('Não deve tentar buscar blob diretamente');
      },
      fetchBlobFromUrl: async () => {
        throw new Error('Não deve tentar reutilizar URL anterior');
      },
      getLastVoiceBlob: async () => {
        domFailures += 1;
        messageHandlers.forEach((handler) => {
          handler({ source: window, data: { type: 'WA_STORE_READY' } });
        });
        throw new Error('Áudio em mensagem: NAO ENCONTRADO');
      },
      lastKnownAudioSrc: null,
      transcribeBlobWithWhisper: async (blob, mimeType) => {
        const buffer = Buffer.from(await blob.arrayBuffer());
        assert.strictEqual(buffer.toString(), 'audio-from-store');
        assert.strictEqual(mimeType, 'audio/ogg');
        storeResponses += 1;
        return 'store-transcribed';
      }
    };

    const transcriptionStore = await AssistantClass.prototype.transcribeAudio.call(
      assistantStoreContext,
      messageElement
    );

    assert.strictEqual(storeResponses, 1, 'Transcrição deve usar blob retornado pelo Store');
    assert.strictEqual(domFailures, 1, 'DOM deve falhar apenas uma vez antes do fallback final');
    assert.strictEqual(transcriptionStore, 'store-transcribed');

    // Garantir que listeners permanecem ativos até o fim
    assert.ok(messageHandlers.size > 0, 'Listeners de mensagem devem permanecer ativos');

    console.log('✔ Fluxos de fallback funcionam para timeout do Store e readiness tardio');
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
