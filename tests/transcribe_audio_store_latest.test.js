const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Blob } = require('buffer');

async function run() {
  const messageHandlers = new Set();
  let shouldReturnBlob = true;
  let storeRequestCount = 0;
  let lastAction = null;

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
      lastAction = payload.action;

      setImmediate(() => {
        messageHandlers.forEach((handler) => {
          if (shouldReturnBlob) {
            handler({
              source: window,
              data: {
                type: 'WA_STORE_RESPONSE',
                requestId: payload.requestId,
                success: true,
                blob: new Blob(['audio-from-store']),
                metadata: { mimeType: 'audio/ogg', fileName: 'from-store.ogg' }
              }
            });
          } else {
            handler({
              source: window,
              data: {
                type: 'WA_STORE_RESPONSE',
                requestId: payload.requestId,
                success: false,
                error: 'sem blob disponível'
              }
            });
          }
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
          remove() {},
          onload: null,
          onerror: null,
          parentNode: { removeChild() {} }
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

  const AssistantClass =
    global.WhatsAppAIAssistant ||
    window.WhatsAppAIAssistant ||
    vm.runInThisContext('typeof WhatsAppAIAssistant !== "undefined" ? WhatsAppAIAssistant : undefined');
  assert.ok(AssistantClass, 'Classe WhatsAppAIAssistant deve estar disponível');

  messageHandlers.forEach((handler) => {
    handler({ source: window, data: { type: 'WA_STORE_READY' } });
  });

  const transcription = await AssistantClass.prototype.transcribeAudio.call(
    {
      transcribeBlobWithWhisper: async (blob, mimeType) => {
        const buffer = Buffer.from(await blob.arrayBuffer());
        assert.strictEqual(buffer.toString(), 'audio-from-store');
        assert.strictEqual(mimeType, 'audio/ogg');
        return 'transcribed-text';
      }
    }
  );

  assert.strictEqual(transcription, 'transcribed-text');
  assert.strictEqual(storeRequestCount, 1, 'Deve solicitar blob mais recente apenas uma vez');
  assert.strictEqual(lastAction, 'GET_LAST_AUDIO_BLOB');

  shouldReturnBlob = false;

  let caughtError = null;
  try {
    await AssistantClass.prototype.transcribeAudio.call({
      transcribeBlobWithWhisper: async () => {
        throw new Error('não deve ser chamada');
      }
    });
  } catch (error) {
    caughtError = error;
  }

  assert.ok(caughtError, 'Erro deve ser propagado quando não há blob');
  assert.ok(
    caughtError.message.includes('sem blob disponível'),
    'Mensagem de erro deve mencionar ausência de blob'
  );
  assert.strictEqual(storeRequestCount, 2, 'Deve tentar novamente ao chamar uma segunda vez');

  const onlyTextMessages = await AssistantClass.prototype.getLastMessagesWithAudio.call({
    getTextOnlyMessages: async () => [
      { text: 'Mensagem A', isOutgoing: false, sender: 'Contato', isAudio: false }
    ],
    transcribeAudio: async () => {
      throw new Error('Nenhum blob de áudio disponível');
    }
  });

  assert.deepStrictEqual(onlyTextMessages, [
    { text: 'Mensagem A', isOutgoing: false, sender: 'Contato', isAudio: false }
  ]);

  const withAudioMessages = await AssistantClass.prototype.getLastMessagesWithAudio.call({
    getTextOnlyMessages: async () => [
      { text: 'Mensagem B', isOutgoing: true, sender: 'Você', isAudio: false }
    ],
    transcribeAudio: async () => 'transcrição de teste'
  });

  assert.strictEqual(withAudioMessages.length, 2);
  assert.deepStrictEqual(withAudioMessages[1], {
    text: 'transcrição de teste (mensagem transcrita de áudio)',
    isOutgoing: false,
    sender: 'Contato',
    isAudio: true
  });

  console.log('✔ transcribeAudio utiliza apenas o último blob do Store');
  console.log('✔ getLastMessagesWithAudio retorna somente textos quando não há áudio');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
