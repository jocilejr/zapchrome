(function () {
  const REQUEST_TYPE = 'WA_STORE_REQUEST';
  const RESPONSE_TYPE = 'WA_STORE_RESPONSE';
  const READY_TYPE = 'WA_STORE_READY';

  const logPrefix = '[WhatsApp AI][PageStore]';

  function log(...args) {
    try {
      console.log(logPrefix, ...args);
    } catch (e) {
      // Ignore logging issues
    }
  }

  let storePromise = null;

  function findStoreInModules(__webpack_require__) {
    const moduleMap = (__webpack_require__ && __webpack_require__.m) || {};
    for (const key of Object.keys(moduleMap)) {
      try {
        const module = __webpack_require__(key);
        const candidate = module && module.default && module.default.Msg ? module.default : module;
        if (candidate && candidate.Msg) {
          return candidate;
        }
      } catch (error) {
        log('Erro ao avaliar módulo WhatsApp', error);
      }
    }
    return null;
  }

  function findChunkArray() {
    try {
      const windowKeys = Object.keys(window || {});
      for (const key of windowKeys) {
        if (key.startsWith('webpackChunk')) {
          const candidate = window[key];
          if (candidate && typeof candidate.push === 'function') {
            return candidate;
          }
        }
      }
    } catch (error) {
      log('Erro ao inspecionar window em busca do chunk webpack', error);
    }

    const legacy = window.webpackChunkwhatsapp_web_client;
    if (legacy && typeof legacy.push === 'function') {
      return legacy;
    }

    return null;
  }

  function ensureStoreInternal() {
    if (window.Store && window.Store.Msg) {
      return Promise.resolve(window.Store);
    }

    if (storePromise) {
      return storePromise;
    }

    storePromise = new Promise((resolve, reject) => {
      const moduleId = `__wa_store_${Date.now()}`;
      let resolved = false;
      let retryTimer = null;
      let timeout = null;

      const cleanup = () => {
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      };

      const injectChunk = (chunk) => {
        timeout = setTimeout(() => {
          if (!resolved) {
            cleanup();
            reject(new Error('Timeout ao localizar Store do WhatsApp'));
          }
        }, 5000);

        try {
          chunk.push([
            [moduleId],
            {},
            (__webpack_require__) => {
              try {
                const store = findStoreInModules(__webpack_require__);
                if (store && store.Msg) {
                  resolved = true;
                  cleanup();
                  window.Store = store;
                  resolve(store);
                  return;
                }
                throw new Error('Store.Msg não encontrado nos módulos do WhatsApp');
              } catch (error) {
                cleanup();
                reject(error);
              }
            }
          ]);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      const attemptHook = () => {
        const chunk = findChunkArray();
        if (!chunk) {
          retryTimer = setTimeout(attemptHook, 250);
          return;
        }

        injectChunk(chunk);
      };

      attemptHook();
    }).catch(error => {
      storePromise = null;
      throw error;
    });

    return storePromise;
  }

  async function ensureStore() {
    const store = await ensureStoreInternal();
    if (store && store.Msg) {
      return store;
    }
    throw new Error('Store.Msg indisponível');
  }

  async function ensureMessageMediaBlob(message) {
    if (!message || !message.mediaData) {
      throw new Error('Mensagem não possui dados de mídia');
    }

    const mediaData = message.mediaData;

    if (
      !mediaData.mediaBlob &&
      !mediaData._mediaBlob &&
      !mediaData.blob &&
      !mediaData.file &&
      !mediaData.mediaBlobUrl
    ) {
      if (typeof message.downloadMedia === 'function') {
        try {
          await message.downloadMedia();
        } catch (error) {
          log('Falha ao baixar mídia internamente', error);
        }
      }
    }

    const candidate =
      mediaData.mediaBlob ||
      mediaData._mediaBlob ||
      mediaData.blob ||
      mediaData.file ||
      mediaData.mediaBlobUrl;

    if (candidate instanceof Blob) {
      return { blob: candidate, mimeType: candidate.type || mediaData.type || mediaData.mimetype };
    }

    if (candidate && candidate.blob instanceof Blob) {
      const blob = candidate.blob;
      return { blob, mimeType: blob.type || mediaData.type || mediaData.mimetype };
    }

    if (typeof candidate === 'string') {
      try {
        const response = await fetch(candidate);
        if (!response.ok) {
          throw new Error(`Falha ao carregar blob da URL: ${response.status}`);
        }
        const blob = await response.blob();
        return { blob, mimeType: blob.type || mediaData.type || mediaData.mimetype };
      } catch (error) {
        throw new Error(`Não foi possível obter blob a partir da URL: ${error.message}`);
      }
    }

    throw new Error('Blob de áudio indisponível para a mensagem');
  }

  async function getAudioBlobByMessageId(messageId) {
    if (!messageId) {
      throw new Error('messageId inválido');
    }

    const store = await ensureStore();
    const message =
      (store.Msg && typeof store.Msg.get === 'function' && store.Msg.get(messageId)) ||
      (store.Msg && typeof store.Msg.find === 'function' &&
        store.Msg.find((msg) => {
          const id = msg && msg.id;
          return (
            id === messageId ||
            (id && (id._serialized === messageId || id.id === messageId))
          );
        }));

    if (!message) {
      throw new Error('Mensagem não encontrada no Store');
    }

    const result = await ensureMessageMediaBlob(message);
    const fileName =
      (message.mediaData && (message.mediaData.filename || message.mediaData.fileName)) ||
      'whatsapp-audio.ogg';

    return {
      blob: result.blob,
      metadata: {
        mimeType: result.mimeType || 'audio/ogg',
        fileName
      }
    };
  }

  function respond(requestId, success, payload) {
    window.postMessage(
      {
        type: RESPONSE_TYPE,
        requestId,
        success,
        ...payload
      },
      '*'
    );
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.type !== REQUEST_TYPE) {
      return;
    }

    const { requestId, action, messageId } = data;

    if (!requestId) {
      return;
    }

    if (action === 'ENSURE_STORE') {
      ensureStore()
        .then(() => {
          respond(requestId, true, {});
        })
        .catch((error) => {
          respond(requestId, false, { error: error.message });
        });
      return;
    }

    if (action === 'GET_AUDIO_BLOB') {
      getAudioBlobByMessageId(messageId)
        .then((result) => {
          respond(requestId, true, {
            blob: result.blob,
            metadata: result.metadata
          });
        })
        .catch((error) => {
          respond(requestId, false, { error: error.message || 'Erro desconhecido' });
        });
      return;
    }
  });

  ensureStore()
    .then(() => {
      window.postMessage({ type: READY_TYPE }, '*');
    })
    .catch((error) => {
      log('Falha inicial ao garantir Store', error);
    });
})();
