// Background Script para WhatsApp AI Assistant
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Configurações padrão na primeira instalação
    chrome.storage.sync.set({
      model: 'gpt-4o',
      responseStyle: 'Responda de forma natural e contextual, mantendo o tom da conversa. Use português brasileiro e seja amigável.',
      transcriptionWebhookUrl: ''
    });

    // Abre a página de configurações
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    });
  }
});

async function getOpenAIKey() {
  const { OPENAI_KEY } = await chrome.storage.local.get('OPENAI_KEY');
  return OPENAI_KEY?.trim() || null;
}

async function getTranscriptionWebhookSettings() {
  const { transcriptionWebhookUrl } = await chrome.storage.sync.get('transcriptionWebhookUrl');
  return {
    transcriptionWebhookUrl: transcriptionWebhookUrl?.trim?.() || ''
  };
}

async function transcreverArrayBuffer(arrayBuffer, mime = 'audio/ogg') {
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    throw new Error('Configure sua OPENAI_KEY no popup.');
  }

  let buffer = arrayBuffer;
  if (!(buffer instanceof ArrayBuffer) && buffer?.buffer instanceof ArrayBuffer) {
    buffer = buffer.buffer;
  }

  if (!(buffer instanceof ArrayBuffer)) {
    throw new Error('Áudio inválido recebido');
  }

  const sanitizedMime = typeof mime === 'string' && mime ? mime : 'audio/ogg';
  const extension = sanitizedMime.includes('mp3')
    ? 'mp3'
    : sanitizedMime.includes('wav')
      ? 'wav'
      : sanitizedMime.includes('m4a')
        ? 'm4a'
        : sanitizedMime.includes('webm')
          ? 'webm'
          : 'ogg';

  const blob = new Blob([buffer], { type: sanitizedMime });
  const file = new File([blob], `audio.${extension}`, { type: sanitizedMime });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');
  formData.append('temperature', '0');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.text;
}

async function transcreverViaWebhook(arrayBuffer, mime = 'audio/ogg', metadata = {}) {
  const { transcriptionWebhookUrl } = await getTranscriptionWebhookSettings();

  if (!transcriptionWebhookUrl) {
    throw new Error('Webhook de transcrição não configurado.');
  }

  let buffer = arrayBuffer;
  if (!(buffer instanceof ArrayBuffer) && buffer?.buffer instanceof ArrayBuffer) {
    buffer = buffer.buffer;
  }

  if (!(buffer instanceof ArrayBuffer)) {
    throw new Error('Áudio inválido recebido');
  }

  const sanitizedMime = typeof mime === 'string' && mime ? mime : 'audio/ogg';
  const extension = sanitizedMime.includes('mp3')
    ? 'mp3'
    : sanitizedMime.includes('wav')
      ? 'wav'
      : sanitizedMime.includes('m4a')
        ? 'm4a'
        : sanitizedMime.includes('webm')
          ? 'webm'
          : 'ogg';

  const blob = new Blob([buffer], { type: sanitizedMime });
  const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: sanitizedMime });

  const normalizedMetadata = {
    ...metadata,
    mimeType: sanitizedMime,
    size: file.size,
    source: 'whatsapp-ai-extension',
    timestamp: metadata?.timestamp || Date.now()
  };

  const formData = new FormData();
  formData.append('file', file);
  formData.append('mimeType', sanitizedMime);
  formData.append('metadata', JSON.stringify(normalizedMetadata));

  let response;
  try {
    response = await fetch(transcriptionWebhookUrl, {
      method: 'POST',
      body: formData
    });
  } catch (error) {
    throw new Error(`Falha ao chamar webhook: ${error.message || error}`);
  }

  const rawText = await response.text();
  let parsed;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed?.error || parsed?.message || rawText || `Webhook ${response.status}`;
    throw new Error(message);
  }

  if (parsed && typeof parsed.text === 'string') {
    return parsed.text;
  }

  if (typeof rawText === 'string' && rawText.trim().length > 0) {
    return rawText.trim();
  }

  throw new Error('Resposta inválida do webhook de transcrição');
}

async function generateChatCompletion(prompt, model = 'gpt-4o') {
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    throw new Error('Configure sua OPENAI_KEY no popup.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// Listener para mensagens dos content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    switch (request?.type) {
      case 'GET_SETTINGS': {
        const result = await chrome.storage.sync.get(['model', 'responseStyle', 'transcriptionWebhookUrl']);
        sendResponse({ ok: true, ...result });
        return;
      }
      case 'CHECK_API_KEY': {
        const key = await getOpenAIKey();
        const { transcriptionWebhookUrl } = await getTranscriptionWebhookSettings();
        sendResponse({
          ok: true,
          configured: !!key,
          webhookConfigured: !!transcriptionWebhookUrl
        });
        return;
      }
      case 'TRANSCRIBIR_AUDIO': {
        const { arrayBuffer, mime, metadata, useWebhook, allowFallback } = request;
        if (useWebhook) {
          try {
            const text = await transcreverViaWebhook(arrayBuffer, mime, metadata);
            sendResponse({ ok: true, text, usedWebhook: true });
            return;
          } catch (error) {
            console.warn('[WhatsApp AI] Falha no webhook de transcrição, tentando fallback', error);
            if (!allowFallback) {
              throw error;
            }
            const fallbackKey = await getOpenAIKey();
            if (!fallbackKey) {
              throw error;
            }
          }
        }

        const text = await transcreverArrayBuffer(arrayBuffer, mime);
        sendResponse({ ok: true, text, usedWebhook: false });
        return;
      }
      case 'GENERATE_COMPLETION': {
        const text = await generateChatCompletion(request.prompt, request.model || 'gpt-4o');
        sendResponse({ ok: true, text });
        return;
      }
      default:
        sendResponse({ ok: false, error: 'Ação não suportada' });
    }
  })().catch((error) => {
    console.error('[WhatsApp AI] Erro no background:', error);
    sendResponse({ ok: false, error: error?.message || String(error) });
  });

  return true;
});

// Atualiza o ícone da extensão baseado no status
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('web.whatsapp.com')) {
    chrome.action.setBadgeText({
      tabId: tabId,
      text: 'ON'
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#25D366' // Verde do WhatsApp
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.action.setBadgeText({
    tabId: tabId,
    text: ''
  });
});