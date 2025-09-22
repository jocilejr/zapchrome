const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Blob } = require('buffer');

async function run() {
  const messageHandlers = new Set();
  const responseHandlers = new Set();
  const readyEvents = [];

  let downloadCalls = 0;

  const audioBlob = new Blob(['audio-mock'], { type: 'audio/ogg' });

  const message = {
    type: 'ptt',
    mediaType: 'audio',
    id: { _serialized: 'message-1' },
    mediaData: {
      mimetype: 'audio/ogg'
    },
    async downloadMedia() {
      downloadCalls += 1;
      return { blob: audioBlob };
    }
  };

  const store = {
    Msg: {
      get(messageId) {
        if (messageId === 'message-1') {
          return message;
        }
        return null;
      }
    },
    Chat: {
      getActive() {
        return {
          msgs: {
            getModels() {
              return [message];
            }
          }
        };
      }
    }
  };

  const window = {
    Store: store,
    postMessage(payload) {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      if (payload.type === 'WA_STORE_RESPONSE') {
        responseHandlers.forEach((handler) => handler(payload));
      } else if (payload.type === 'WA_STORE_READY') {
        readyEvents.push(payload);
      }
    },
    addEventListener(type, handler) {
      if (type === 'message' && typeof handler === 'function') {
        messageHandlers.add(handler);
      }
    },
    removeEventListener(type, handler) {
      if (type === 'message') {
        messageHandlers.delete(handler);
      }
    }
  };

  global.window = window;
  global.Blob = global.Blob || Blob;
  global.fetch = global.fetch || (async () => {
    throw new Error('fetch não disponível no ambiente de teste');
  });
  global.console = console;

  const scriptContent = fs.readFileSync(
    path.join(__dirname, '..', 'whatsapp-ai-extension', 'page-store.js'),
    'utf8'
  );

  vm.runInThisContext(scriptContent, { filename: 'page-store.js' });

  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(readyEvents.length, 1, 'helper deve sinalizar READY após carregamento');

  function dispatchMessage(data) {
    messageHandlers.forEach((handler) => {
      handler({ source: window, data });
    });
  }

  function waitForResponse(requestId) {
    return new Promise((resolve) => {
      const handler = (payload) => {
        if (payload.requestId === requestId) {
          responseHandlers.delete(handler);
          resolve(payload);
        }
      };
      responseHandlers.add(handler);
    });
  }

  async function request(action, extra = {}) {
    const requestId = `test_${Math.random().toString(16).slice(2)}`;
    const pending = waitForResponse(requestId);
    dispatchMessage({
      type: 'WA_STORE_REQUEST',
      action,
      requestId,
      ...extra
    });
    return pending;
  }

  const lastAudioResponse = await request('GET_LAST_AUDIO_BLOB');
  assert.strictEqual(lastAudioResponse.success, true, 'GET_LAST_AUDIO_BLOB deve responder com sucesso');
  assert.ok(lastAudioResponse.blob, 'blob deve ser retornado');
  const bufferFromLastAudio = Buffer.from(await lastAudioResponse.blob.arrayBuffer());
  assert.strictEqual(bufferFromLastAudio.toString(), 'audio-mock');
  assert.strictEqual(
    downloadCalls,
    1,
    'downloadMedia deve ser chamado uma única vez para buscar o blob ausente'
  );

  const audioByIdResponse = await request('GET_AUDIO_BLOB', { messageId: 'message-1' });
  assert.strictEqual(audioByIdResponse.success, true, 'GET_AUDIO_BLOB deve responder com sucesso');
  assert.ok(audioByIdResponse.blob, 'blob deve ser retornado para GET_AUDIO_BLOB');
  const bufferFromAudioById = Buffer.from(await audioByIdResponse.blob.arrayBuffer());
  assert.strictEqual(bufferFromAudioById.toString(), 'audio-mock');

  console.log('✔ Testes do helper do Store passaram com sucesso');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
