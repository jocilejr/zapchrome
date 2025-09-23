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
  const filename = metadata?.filename || `audio-${metadata?.messageId || Date.now()}.${extension}`;

  const normalizedMetadata = {
    ...metadata,
    mimeType: sanitizedMime,
    size: typeof metadata?.size === 'number' ? metadata.size : buffer.byteLength,
    source: 'whatsapp-ai-extension',
    timestamp: metadata?.timestamp || Date.now(),
    filename
  };

  const headers = new Headers({
    'Content-Type': sanitizedMime,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'X-WhatsApp-AI-Source': 'zapchrome'
  });

  try {
    headers.set('X-WhatsApp-AI-Metadata', JSON.stringify(normalizedMetadata));
  } catch (error) {
    console.warn('[WhatsApp AI] Falha ao serializar metadata para header', error);
  }

  Object.entries(normalizedMetadata).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    const normalizedKey = key
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!normalizedKey) {
      return;
    }

    if (['string', 'number', 'boolean'].includes(typeof value)) {
      headers.set(`X-WhatsApp-AI-${normalizedKey}`, String(value));
    }
  });

  let response;
  try {
    response = await fetch(transcriptionWebhookUrl, {
      method: 'POST',
      headers,
      body: buffer
    });
  } catch (error) {
    throw new Error(`Falha ao chamar webhook: ${error.message || error}`);
  }

  let rawText = '';
  try {
    rawText = await response.text();
  } catch (error) {
    console.warn('[WhatsApp AI] Falha ao ler resposta do webhook como texto', error);
  }

  let parsed = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      parsed = null;
    }
  }

  if (!response.ok) {
    const message = parsed?.error || parsed?.message || rawText || `Webhook ${response.status}`;
    throw new Error(message);
  }

  const candidateText = [
    parsed?.text,
    parsed?.transcription,
    parsed?.transcript,
    parsed?.response,
    parsed?.content,
    parsed?.data?.text,
    parsed?.data?.transcription,
    parsed?.result,
    typeof rawText === 'string' ? rawText.trim() : null
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  if (candidateText) {
    return candidateText.trim();
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
        const { arrayBuffer, mime, metadata } = request;
        const text = await transcreverViaWebhook(arrayBuffer, mime, metadata);
        sendResponse({ ok: true, text });
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