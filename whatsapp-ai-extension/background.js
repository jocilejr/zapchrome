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

// Listener para mensagens dos content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(['apiKey', 'model', 'responseStyle'])
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Mantém o canal de mensagem aberto para resposta assíncrona
  }
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