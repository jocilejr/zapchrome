const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Blob } = require('buffer');

async function run() {
  const messageHandlers = new Set();
  const responseHandlers = new Set();
  const readyEvents = [];

  let downloadCallsInline = 0;
  let downloadCallsDataUrl = 0;

  const inlineBlob = new Blob(['audio-inline'], { type: 'audio/ogg' });
  const dataUrlPayload = Buffer.from('audio-from-data').toString('base64');
  const fullDataUrl = `data:audio/ogg; codecs=opus;base64,${dataUrlPayload}`;

  const inlineMessage = {
    type: 'ptt',
    mediaType: 'audio',
    id: { _serialized: 'message-inline' },
    mediaData: {
      mimetype: 'audio/ogg',
      mediaBlob: inlineBlob
    },
    async downloadMedia() {
      downloadCallsInline += 1;
      return { blob: inlineBlob };
    }
  };

  const dataUrlMessage = {
    type: 'ptt',
    mediaType: 'audio',
    id: { _serialized: 'message-data-url' },
    mediaData: {
      mimetype: 'audio/ogg'
    },
    async downloadMedia() {
      downloadCallsDataUrl += 1;
      return {
        data: fullDataUrl,
        mimeType: 'audio/ogg'
      };
    }
  };

  const textMessage = {
    type: 'chat',
    mediaType: 'text',
    id: { _serialized: 'message-text' },
    mediaData: null
  };

  const store = {
    Msg: {
      get(messageId) {
        if (messageId === 'message-inline') {
          return inlineMessage;
        }
        if (messageId === 'message-data-url') {
          return dataUrlMessage;
        }
        return null;
      }
    },
    Chat: {
      getActive() {
        return {
          msgs: {
            getModels() {
              return [textMessage, inlineMessage, dataUrlMessage];
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
  assert.strictEqual(bufferFromLastAudio.toString(), 'audio-from-data');
  assert.strictEqual(
    downloadCallsDataUrl,
    1,
    'downloadMedia deve ser chamado uma única vez para converter data URL em blob'
  );

  const audioByIdInlineResponse = await request('GET_AUDIO_BLOB', { messageId: 'message-inline' });
  assert.strictEqual(audioByIdInlineResponse.success, true, 'GET_AUDIO_BLOB deve responder com sucesso');
  assert.ok(audioByIdInlineResponse.blob, 'blob inline deve ser retornado');
  const bufferFromInline = Buffer.from(await audioByIdInlineResponse.blob.arrayBuffer());
  assert.strictEqual(bufferFromInline.toString(), 'audio-inline');
  assert.strictEqual(downloadCallsInline, 0, 'downloadMedia não deve ser chamado quando blob inline está presente');

  const audioByIdDataUrlResponse = await request('GET_AUDIO_BLOB', { messageId: 'message-data-url' });
  assert.strictEqual(
    audioByIdDataUrlResponse.success,
    true,
    'GET_AUDIO_BLOB deve responder com sucesso para mensagem com data URL'
  );
  assert.ok(audioByIdDataUrlResponse.blob, 'blob deve ser retornado a partir do data URL');
  const bufferFromAudioById = Buffer.from(await audioByIdDataUrlResponse.blob.arrayBuffer());
  assert.strictEqual(bufferFromAudioById.toString(), 'audio-from-data');
  assert.strictEqual(
    downloadCallsDataUrl,
    2,
    'downloadMedia deve ser chamado novamente quando blob precisa ser recuperado por id'
  );

  console.log('✔ Testes do helper do Store passaram com sucesso');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
