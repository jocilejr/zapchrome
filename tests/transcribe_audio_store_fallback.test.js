const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Blob } = require('buffer');

async function run() {
  const messageHandlers = new Set();
  const storeBlob = new Blob(['audio-from-store']);
  let storeRequestCount = 0;

  const window = {};
  global.window = window;
  window.window = window;
  window.__uiUpdate = () => {};

  window.postMessage = (payload) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    if (payload.type === 'WA_STORE_REQUEST') {
      storeRequestCount += 1;
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

  const assistantContext = {
    findPlayableAudioElementWithin: () => null,
    ensureAudioReady: async () => {},
    fetchBlobFromAudioElement: async () => {
      throw new Error('Não deve tentar buscar blob diretamente');
    },
    fetchBlobFromUrl: async () => {
      throw new Error('Não deve tentar reutilizar URL anterior');
    },
    getLastVoiceBlob: async () => {
      throw new Error('Não deve recorrer ao DOM global');
    },
    lastKnownAudioSrc: null,
    transcribeBlobWithWhisper: async (blob, mimeType) => {
      const buffer = Buffer.from(await blob.arrayBuffer());
      assert.strictEqual(buffer.toString(), 'audio-from-store');
      assert.strictEqual(mimeType, 'audio/ogg');
      return 'transcribed-text';
    }
  };

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

  const fallbackBlob = new Blob(['audio-from-dom-fallback']);
  let fallbackUsed = false;

  const fallbackContext = {
    findPlayableAudioElementWithin: () => null,
    ensureAudioReady: async () => {
      throw new Error('Não deve preparar <audio> direto da mensagem');
    },
    fetchBlobFromAudioElement: async () => {
      throw new Error('Não deve tentar buscar blob diretamente');
    },
    fetchBlobFromUrl: async () => {
      throw new Error('Não deve tentar reutilizar URL anterior');
    },
    getLastVoiceBlob: async () => {
      fallbackUsed = true;
      return {
        blob: fallbackBlob,
        audioElement: { currentSrc: 'blob:fallback-audio' }
      };
    },
    lastKnownAudioSrc: null,
    transcribeBlobWithWhisper: async (blob, mimeType) => {
      const buffer = Buffer.from(await blob.arrayBuffer());
      assert.strictEqual(buffer.toString(), 'audio-from-dom-fallback');
      assert.strictEqual(mimeType, 'audio/ogg');
      return 'fallback-transcribed-text';
    }
  };

  const fallbackTranscription = await AssistantClass.prototype.transcribeAudio.call(
    fallbackContext,
    messageElement
  );

  assert.strictEqual(fallbackTranscription, 'fallback-transcribed-text');
  assert.strictEqual(fallbackUsed, true, 'Deve recorrer ao último áudio disponível no DOM');
  assert.strictEqual(storeRequestCount, 0, 'Não deve enviar requisição ao Store quando readiness expira');

  storeRequestCount = 0;

  let failingDomAttempts = 0;

  const failingDomContext = {
    findPlayableAudioElementWithin: () => null,
    ensureAudioReady: async () => {
      throw new Error('Não deve preparar <audio> direto da mensagem');
    },
    fetchBlobFromAudioElement: async () => {
      throw new Error('Não deve tentar buscar blob diretamente');
    },
    fetchBlobFromUrl: async () => {
      throw new Error('Não deve tentar reutilizar URL anterior');
    },
    getLastVoiceBlob: async () => {
      failingDomAttempts += 1;
      setImmediate(() => {
        messageHandlers.forEach((handler) => {
          handler({ source: window, data: { type: 'WA_STORE_READY' } });
        });
      });
      throw new Error('Falha simulada ao obter áudio do DOM');
    },
    lastKnownAudioSrc: null,
    transcribeBlobWithWhisper: async (blob, mimeType) => {
      const buffer = Buffer.from(await blob.arrayBuffer());
      assert.strictEqual(buffer.toString(), 'audio-from-store');
      assert.strictEqual(mimeType, 'audio/ogg');
      return 'store-fallback-transcribed';
    }
  };

  const storeFallbackTranscription = await AssistantClass.prototype.transcribeAudio.call(
    failingDomContext,
    messageElement
  );

  assert.strictEqual(storeFallbackTranscription, 'store-fallback-transcribed');
  assert.strictEqual(failingDomAttempts, 1, 'Deve tentar recuperar áudio do DOM uma vez');
  assert.strictEqual(
    storeRequestCount,
    1,
    'Fallback final deve recorrer ao Store após readiness ser sinalizado'
  );

  storeRequestCount = 0;

  // Libera a promise de readiness do Store para o cenário principal
  messageHandlers.forEach((handler) => {
    handler({ source: window, data: { type: 'WA_STORE_READY' } });
  });

  const transcription = await AssistantClass.prototype.transcribeAudio.call(
    assistantContext,
    messageElement
  );

  assert.strictEqual(transcription, 'transcribed-text');
  assert.strictEqual(storeRequestCount, 1, 'Deve enviar uma requisição ao Store quando readiness está OK');
  assert.strictEqual(
    messageHandlers.size > 0,
    true,
    'Listeners de mensagem devem permanecer registrados até conclusão'
  );

  console.log('✔ Fallback via DOM funciona quando WA_STORE_READY não ocorre');
  console.log('✔ Fallback para Store funciona quando não há <audio> no DOM');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
