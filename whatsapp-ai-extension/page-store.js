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
    const safeWindow = typeof window !== 'undefined' ? window : null;
    if (!safeWindow) {
      return null;
    }

    try {
      const windowKeys = Object.getOwnPropertyNames(safeWindow);
      for (const key of windowKeys) {
        try {
          const candidate = safeWindow[key];
          if (
            candidate &&
            typeof candidate.push === 'function' &&
            (Array.isArray(candidate) || /webpackChunk/i.test(key))
          ) {
            return candidate;
          }
        } catch (innerError) {
          // Ignora problemas em propriedades individuais
        }
      }
    } catch (error) {
      log('Erro ao inspecionar window em busca do chunk webpack', error);
    }

    const legacy = safeWindow.webpackChunkwhatsapp_web_client;
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
      const chunkRetryInterval = 250;
      const chunkWaitTimeoutMs = 8000;
      const chunkWaitStart = Date.now();

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
          if (Date.now() - chunkWaitStart >= chunkWaitTimeoutMs) {
            cleanup();
            reject(new Error('Timeout aguardando chunk webpack do WhatsApp'));
            return;
          }

          retryTimer = setTimeout(attemptHook, chunkRetryInterval);
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

  function isBlobLike(candidate) {
    if (!candidate) {
      return false;
    }

    if (typeof Blob !== 'undefined' && candidate instanceof Blob) {
      return true;
    }

    const tag = Object.prototype.toString.call(candidate);
    return tag === '[object Blob]' || tag === '[object File]';
  }

  function unwrapBlob(candidate) {
    if (!candidate) {
      return null;
    }

    if (isBlobLike(candidate)) {
      return candidate;
    }

    if (candidate.blob && isBlobLike(candidate.blob)) {
      return candidate.blob;
    }

    if (candidate._blob && isBlobLike(candidate._blob)) {
      return candidate._blob;
    }

    if (candidate.data && isBlobLike(candidate.data)) {
      return candidate.data;
    }

    return null;
  }

  function decodeBase64ToUint8Array(base64) {
    if (typeof base64 !== 'string' || !base64) {
      return null;
    }

    try {
      if (typeof atob === 'function') {
        const normalized = base64.replace(/\s+/g, '');
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      }

      if (typeof Buffer !== 'undefined') {
        const buffer = Buffer.from(base64, 'base64');
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
      }
    } catch (error) {
      log('Falha ao decodificar base64 para Uint8Array', error);
    }

    return null;
  }

  function blobFromDataString(dataString, fallbackMimeType) {
    if (typeof dataString !== 'string' || !dataString) {
      return null;
    }

    let mimeType = fallbackMimeType || 'application/octet-stream';
    let payload = dataString;
    let isBase64 = true;

    if (dataString.startsWith('data:')) {
      const commaIndex = dataString.indexOf(',');
      if (commaIndex === -1) {
        return null;
      }

      const metadata = dataString.substring(5, commaIndex);
      const segments = metadata
        .split(';')
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (segments.length > 0) {
        mimeType = segments[0];
      }

      isBase64 = segments.includes('base64');
      payload = dataString.substring(commaIndex + 1);

      if (!isBase64) {
        try {
          const decoded = decodeURIComponent(payload);
          return new Blob([decoded], { type: mimeType });
        } catch (error) {
          log('Falha ao decodificar data URI não-base64', error);
          return null;
        }
      }
    }

    const bytes = decodeBase64ToUint8Array(payload);
    if (!bytes) {
      return null;
    }

    return new Blob([bytes.buffer], { type: mimeType });
  }

  function coerceStringToBlob(candidate, fallbackMimeType) {
    if (typeof candidate !== 'string' || !candidate) {
      return null;
    }

    if (candidate.startsWith('data:')) {
      return blobFromDataString(candidate, fallbackMimeType);
    }

    return null;
  }

  async function fetchBlobFromUrl(url, fallbackMimeType) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      if (!blob.type && fallbackMimeType) {
        return new Blob([await blob.arrayBuffer()], { type: fallbackMimeType });
      }
      return blob;
    } catch (error) {
      throw new Error(`Não foi possível obter blob a partir da URL: ${error.message}`);
    }
  }

  function resolveMediaUrls(mediaData, downloadResult) {
    const urls = [];

    if (mediaData) {
      const mediaUrls = [
        mediaData.mediaBlobUrl,
        mediaData.mediaUrl,
        mediaData.url,
        mediaData.clientUrl,
        mediaData.directPath ? `https://mmg.whatsapp.net${mediaData.directPath}` : null,
        mediaData.streamableUrl,
        mediaData.renderableUrl
      ];

      mediaUrls.forEach((value) => {
        if (typeof value === 'string' && value) {
          urls.push(value);
        }
      });
    }

    if (downloadResult) {
      const downloadUrls = [
        downloadResult.mediaBlobUrl,
        downloadResult.url,
        downloadResult.directPath ? `https://mmg.whatsapp.net${downloadResult.directPath}` : null,
        downloadResult.clientUrl
      ];

      downloadUrls.forEach((value) => {
        if (typeof value === 'string' && value) {
          urls.push(value);
        }
      });
    }

    return urls.filter(Boolean);
  }

  async function ensureMessageMediaBlob(message) {
    if (!message || !message.mediaData) {
      throw new Error('Mensagem não possui dados de mídia');
    }

    const mediaData = message.mediaData;
    let downloadResult = null;

    const inlineBlob =
      unwrapBlob(mediaData.mediaBlob) ||
      unwrapBlob(mediaData._mediaBlob) ||
      unwrapBlob(mediaData.blob) ||
      unwrapBlob(mediaData.file);

    if (!inlineBlob && typeof message.downloadMedia === 'function') {
      try {
        downloadResult = await message.downloadMedia();
      } catch (error) {
        log('Falha ao baixar mídia internamente', error);
      }
    }

    const preferredMimeType =
      mediaData.type ||
      mediaData.mimetype ||
      mediaData.mimeType ||
      (downloadResult && (downloadResult.mimeType || downloadResult.mimetype)) ||
      'audio/ogg';

    const downloadBlob =
      unwrapBlob(downloadResult && downloadResult.mediaBlob) ||
      unwrapBlob(downloadResult && downloadResult._mediaBlob) ||
      unwrapBlob(downloadResult && downloadResult.blob) ||
      unwrapBlob(downloadResult && downloadResult.file) ||
      unwrapBlob(downloadResult && downloadResult.data);

    const dataUrlBlob =
      (typeof mediaData.data === 'string' && blobFromDataString(mediaData.data, preferredMimeType)) ||
      (downloadResult && typeof downloadResult.data === 'string'
        ? blobFromDataString(downloadResult.data, preferredMimeType)
        : null);

    const bufferBlob =
      downloadResult && downloadResult.buffer instanceof ArrayBuffer
        ? new Blob([downloadResult.buffer], { type: preferredMimeType })
        : null;

    const candidateBlob = inlineBlob || downloadBlob || dataUrlBlob || bufferBlob;

    if (candidateBlob) {
      return { blob: candidateBlob, mimeType: candidateBlob.type || preferredMimeType };
    }

    const urls = resolveMediaUrls(mediaData, downloadResult);
    for (const url of urls) {
      const directBlob = coerceStringToBlob(url, preferredMimeType);
      if (directBlob) {
        return { blob: directBlob, mimeType: directBlob.type || preferredMimeType };
      }

      try {
        const fetchedBlob = await fetchBlobFromUrl(url, preferredMimeType);
        if (fetchedBlob) {
          return { blob: fetchedBlob, mimeType: fetchedBlob.type || preferredMimeType };
        }
      } catch (error) {
        log('Falha ao obter blob a partir de URL conhecida da mídia', error);
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

  function collectionToArray(candidate) {
    if (!candidate) {
      return [];
    }

    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (typeof candidate.toArray === 'function') {
      try {
        const array = candidate.toArray();
        if (Array.isArray(array)) {
          return array;
        }
      } catch (error) {
        log('Falha ao converter coleção para array via toArray', error);
      }
    }

    if (typeof candidate.values === 'function') {
      try {
        return Array.from(candidate.values());
      } catch (error) {
        log('Falha ao converter coleção para array via values()', error);
      }
    }

    if (typeof candidate.forEach === 'function') {
      const array = [];
      try {
        candidate.forEach((value) => {
          array.push(value);
        });
      } catch (error) {
        log('Falha ao converter coleção para array via forEach()', error);
      }

      if (array.length) {
        return array;
      }
    }

    if (typeof candidate === 'object') {
      try {
        const values = Object.values(candidate).filter((value) =>
          value && typeof value === 'object'
        );
        if (values.length) {
          return values;
        }
      } catch (error) {
        log('Falha ao converter objeto para array', error);
      }
    }

    return [];
  }

  function resolveMessageModels(messagesCollection) {
    if (!messagesCollection) {
      return [];
    }

    const extractionStrategies = [
      () =>
        typeof messagesCollection.getModelsArray === 'function'
          ? messagesCollection.getModelsArray()
          : null,
      () =>
        typeof messagesCollection.getModels === 'function'
          ? messagesCollection.getModels()
          : null,
      () =>
        typeof messagesCollection.all === 'function'
          ? messagesCollection.all()
          : null,
      () => messagesCollection.models,
      () => messagesCollection._models
    ];

    for (const getCandidate of extractionStrategies) {
      let candidate = null;
      try {
        candidate = getCandidate();
      } catch (error) {
        log('Falha ao extrair mensagens da conversa ativa', error);
      }

      const asArray = collectionToArray(candidate);
      if (asArray.length) {
        return asArray;
      }
    }

    return collectionToArray(messagesCollection);
  }

  async function getLastAudioBlobFromActiveChat() {
    const store = await ensureStore();

    const activeChat =
      store.Chat && typeof store.Chat.getActive === 'function'
        ? store.Chat.getActive()
        : null;

    const messagesCollection = activeChat && activeChat.msgs;
    const messageModels = resolveMessageModels(messagesCollection);

    if (!Array.isArray(messageModels) || messageModels.length === 0) {
      throw new Error('Nenhuma mensagem encontrada na conversa ativa');
    }

    for (let index = messageModels.length - 1; index >= 0; index -= 1) {
      const message = messageModels[index];

      if (!message || !message.mediaData) {
        continue;
      }

      const messageType = message.type || message.__x_type;
      const messageMediaType =
        message.mediaType || message.__x_mediaType || message.mediaData.type || message.mediaData.mimetype;

      if (messageType !== 'ptt' && messageMediaType !== 'audio') {
        continue;
      }

      try {
        const result = await ensureMessageMediaBlob(message);
        const mediaData = message.mediaData || {};
        const fileName = mediaData.filename || mediaData.fileName || 'whatsapp-audio.ogg';
        const id = message.id;
        const serializedId =
          typeof id === 'string'
            ? id
            : id && (id._serialized || id.id || (typeof id.toString === 'function' ? id.toString() : null));

        return {
          blob: result.blob,
          metadata: {
            mimeType: result.mimeType || mediaData.mimetype || 'audio/ogg',
            fileName,
            messageId: serializedId || null
          }
        };
      } catch (error) {
        log('Falha ao garantir blob da última mensagem de áudio', error);
      }
    }

    throw new Error('Nenhuma mensagem de voz encontrada na conversa ativa');
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

    if (action === 'GET_LAST_AUDIO_BLOB') {
      getLastAudioBlobFromActiveChat()
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
