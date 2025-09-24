// Background Script para WhatsApp AI Assistant
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Configurações padrão na primeira instalação
    chrome.storage.sync.set({
      model: 'gpt-4o',
      responseStyle: 'Responda de forma natural e contextual, mantendo o tom da conversa. Use português brasileiro e seja amigável.'
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
        const result = await chrome.storage.sync.get(['model', 'responseStyle']);
        sendResponse({ ok: true, ...result });
        return;
      }
      case 'CHECK_API_KEY': {
        const key = await getOpenAIKey();
        sendResponse({
          ok: true,
          configured: !!key
        });
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