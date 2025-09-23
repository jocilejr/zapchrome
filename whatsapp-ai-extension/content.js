if (!window.__uiUpdate) {
  window.__uiUpdate = (...args) => console.log('[UI update]', ...args);
}

const update = (...args) => window.__uiUpdate(...args);

const WA_STORE_REQUEST = 'WA_STORE_REQUEST';
const WA_STORE_RESPONSE = 'WA_STORE_RESPONSE';
const WA_STORE_READY = 'WA_STORE_READY';

const pendingStoreRequests = new Map();
const STORE_READY_TIMEOUT_MS = 2000;
const STORE_READY_TIMEOUT_CODE = 'WA_STORE_READY_TIMEOUT';

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) {
      return;
    }

    const { data } = event;

    if (data.type === WA_STORE_READY) {
      window.__zapPageStoreReady = true;
      return;
    }

    if (data.type !== WA_STORE_RESPONSE || !data.requestId) {
      return;
    }

    const pending = pendingStoreRequests.get(data.requestId);
    if (!pending) {
      return;
    }

    pendingStoreRequests.delete(data.requestId);
    clearTimeout(pending.timeout);

    if (data.success) {
      pending.resolve(data);
    } else {
      pending.reject(new Error(data.error || 'Falha ao obter blob via Store'));
    }
  });
}

const ensurePageStoreReady = (() => {
  let readyPromise = null;
  let scriptInjected = false;

  return () => {
    if (window.__zapPageStoreReady) {
      return Promise.resolve(true);
    }

    if (readyPromise) {
      return readyPromise;
    }

    const promise = new Promise((resolve, reject) => {
      let readinessTimeout = null;

      const cleanup = () => {
        window.removeEventListener('message', handleReady);
        if (readinessTimeout) {
          clearTimeout(readinessTimeout);
          readinessTimeout = null;
        }
      };

      const handleReady = (event) => {
        if (event.source !== window || !event.data || event.data.type !== WA_STORE_READY) {
          return;
        }

        window.__zapPageStoreReady = true;
        cleanup();
        resolve(true);
      };

      window.addEventListener('message', handleReady);

      readinessTimeout = setTimeout(() => {
        cleanup();
        const timeoutError = new Error('Timeout aguardando readiness do Store');
        timeoutError.code = STORE_READY_TIMEOUT_CODE;
        reject(timeoutError);
      }, STORE_READY_TIMEOUT_MS);

      if (!scriptInjected) {
        scriptInjected = true;

        try {
          const script = document.createElement('script');
          script.type = 'text/javascript';
          script.async = false;
          script.src = chrome.runtime.getURL('page-store.js');
          script.onload = () => {
            if (script.parentNode) {
              script.parentNode.removeChild(script);
            }
          };
          script.onerror = () => {
            if (script.parentNode) {
              script.parentNode.removeChild(script);
            }
          };

          const parent = document.documentElement || document.head || document.body;
          if (parent && typeof parent.appendChild === 'function') {
            parent.appendChild(script);
          }
        } catch (error) {
          console.warn('[WhatsApp AI] Falha ao injetar page-store.js', error);
        }
      }
    });

    readyPromise = promise.catch((error) => {
      readyPromise = null;
      throw error;
    });

    return readyPromise;
  };
})();

function getMessageIdFromElement(element) {
  if (!element) {
    return null;
  }

  const attributeNames = [
    'data-id',
    'data-message-id',
    'data-msg-id',
    'data-msgid',
    'data-messagekey'
  ];

  const datasetKeys = ['id', 'messageId', 'msgId', 'msgid', 'serializedId'];

  let current = element;
  while (current && current !== document) {
    if (current.dataset) {
      for (const key of datasetKeys) {
        if (current.dataset[key]) {
          return current.dataset[key];
        }
      }
    }

    if (typeof current.getAttribute === 'function') {
      for (const attr of attributeNames) {
        const value = current.getAttribute(attr);
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    current = current.parentElement || current.parentNode;
  }

  return null;
}

async function requestStoreBlob(messageId) {
  if (!messageId) {
    throw new Error('ID da mensagem inválido');
  }

  try {
    await ensurePageStoreReady();
  } catch (error) {
    if (error && error.code === STORE_READY_TIMEOUT_CODE) {
      console.warn('[WhatsApp AI] Store do WhatsApp não sinalizou readiness no tempo esperado');
      return null;
    }

    throw new Error(`Store do WhatsApp indisponível: ${error.message}`);
  }

  return new Promise((resolve, reject) => {
    const requestId = `wa_store_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timeout = setTimeout(() => {
      pendingStoreRequests.delete(requestId);
      reject(new Error('Timeout aguardando resposta do Store'));
    }, 10000);

    pendingStoreRequests.set(requestId, { resolve, reject, timeout });

    try {
      window.postMessage(
        {
          type: WA_STORE_REQUEST,
          action: 'GET_AUDIO_BLOB',
          requestId,
          messageId
        },
        '*'
      );
    } catch (error) {
      clearTimeout(timeout);
      pendingStoreRequests.delete(requestId);
      reject(error);
    }
  });
}

async function requestLastStoreAudioBlob() {
  try {
    await ensurePageStoreReady();
  } catch (error) {
    throw new Error(`Store do WhatsApp indisponível: ${error.message}`);
  }

  return new Promise((resolve, reject) => {
    const requestId = `wa_store_last_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timeout = setTimeout(() => {
      pendingStoreRequests.delete(requestId);
      reject(new Error('Timeout aguardando blob mais recente do Store'));
    }, 10000);

    pendingStoreRequests.set(requestId, { resolve, reject, timeout });

    try {
      window.postMessage(
        {
          type: WA_STORE_REQUEST,
          action: 'GET_LAST_AUDIO_BLOB',
          requestId
        },
        '*'
      );
    } catch (error) {
      clearTimeout(timeout);
      pendingStoreRequests.delete(requestId);
      reject(error);
    }
  });
}

async function normalizeHelperBlob(response) {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const metadata = response.metadata && typeof response.metadata === 'object'
    ? { ...response.metadata }
    : {};

  const blob = response.blob;
  if (!blob) {
    return { blob: null, metadata };
  }

  if (blob.type) {
    return { blob, metadata };
  }

  if (metadata.mimeType && typeof blob.arrayBuffer === 'function') {
    try {
      const buffer = await blob.arrayBuffer();
      return { blob: new Blob([buffer], { type: metadata.mimeType }), metadata };
    } catch (error) {
      console.warn('[WhatsApp AI] Falha ao normalizar blob retornado pelo Store', error);
    }
  }

  return { blob, metadata };
}

if (typeof window !== 'undefined') {
  window.__zapStoreHelpers = {
    getMessageIdFromElement,
    requestStoreBlob,
    requestLastStoreAudioBlob,
    normalizeHelperBlob,
    ensurePageStoreReady
  };
}

ensurePageStoreReady().catch((error) => {
  console.warn('[WhatsApp AI] Não foi possível preparar o Store do WhatsApp', error);
});

// WhatsApp AI Assistant Content Script - Versão Limpa
class WhatsAppAIAssistant {
  constructor() {
    this.isActive = false;
    this.button = null;
    this.settings = {
      model: 'gpt-4o',
      responseStyle: 'Responda de forma natural e contextual, mantendo o tom da conversa'
    };
    this.apiKeyConfigured = false;
    this.lastKnownAudioSrc = null;
    console.log('[WhatsApp AI] Construtor iniciado');
    this.init();
  }

  async init() {
    console.log('[WhatsApp AI] Inicializando...');
    await this.loadSettings();
    this.createFloatingButton();
    this.observeConversationChanges();

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'SETTINGS_UPDATED') {
        this.loadSettings();
      }
    });

    // Expor instância globalmente para debug
    window.whatsappAI = this;
    console.log('[WhatsApp AI] Inicialização completa');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['model', 'responseStyle']);
      this.settings = {
        model: result.model || 'gpt-4o',
        responseStyle: result.responseStyle || 'Responda de forma natural e contextual, mantendo o tom da conversa'
      };

      await this.ensureApiKeyConfigured();
    } catch (error) {
      console.log('Erro ao carregar configurações:', error);
    }
  }

  async ensureApiKeyConfigured() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_API_KEY' });
      this.apiKeyConfigured = !!response?.configured;
    } catch (error) {
      console.warn('[WhatsApp AI] Não foi possível verificar estado da API Key', error);
      this.apiKeyConfigured = false;
    }

    return this.apiKeyConfigured;
  }

  observeConversationChanges() {
    console.log('[WhatsApp AI] Iniciando observação de mudanças...');
    const observer = new MutationObserver(() => {
      this.checkConversationState();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Verificação inicial com delay
    setTimeout(() => {
      console.log('[WhatsApp AI] Verificação inicial...');
      this.checkConversationState();
    }, 3000);
  }

  checkConversationState() {
    console.log('[WhatsApp AI] Verificando estado da conversa...');
    
    // Seletores simples e eficazes
    const inputSelectors = [
      '[data-testid="compose-box-input"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"]'
    ];
    
    let messageInput = null;
    
    for (const selector of inputSelectors) {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
        // Verifica se NÃO é campo de busca de forma simples
        const placeholder = input.getAttribute('placeholder') || '';
        const isSearch = placeholder.toLowerCase().includes('pesquisar') || 
                        placeholder.toLowerCase().includes('search') ||
                        input.closest('[data-testid="chat-list-search"]');
        
        if (!isSearch && input.offsetParent !== null) {
          messageInput = input;
          console.log(`[WhatsApp AI] Input encontrado: ${selector}`);
          break;
        }
      }
      if (messageInput) break;
    }
    
    const isConversationOpen = messageInput !== null;
    
    console.log(`[WhatsApp AI] Estado - Input: ${!!messageInput}, Ativa: ${isConversationOpen}`);
    
    if (isConversationOpen && !this.isActive) {
      console.log('[WhatsApp AI] Mostrando botão...');
      this.showButton();
    } else if (!isConversationOpen && this.isActive) {
      console.log('[WhatsApp AI] Escondendo botão...');
      this.hideButton();
    }
  }

  createFloatingButton() {
    if (this.button) return;

    console.log('[WhatsApp AI] Criando botão flutuante...');
    
    this.button = document.createElement('div');
    this.button.className = 'whatsapp-ai-button hidden';
    this.button.innerHTML = `
      <div class="ai-button-content">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <span>IA</span>
      </div>
      <div class="ai-button-tooltip">Gerar Resposta com IA</div>
    `;
    
    this.button.addEventListener('click', () => {
      console.log('[WhatsApp AI] Botão clicado!');
      this.generateResponse();
    });
    
    document.body.appendChild(this.button);
    console.log('[WhatsApp AI] Botão criado e adicionado ao DOM');
    
    // Adiciona funções de teste global
    window.showAIButton = () => {
      console.log('[WhatsApp AI] Forçando exibição do botão...');
      this.showButton();
    };
    
    // Força uma verificação do estado após criar o botão
    setTimeout(() => this.checkConversationState(), 1000);
  }

  showButton() {
    console.log('[WhatsApp AI] Tentando mostrar botão...');
    if (this.button && !this.isActive) {
      this.button.classList.remove('hidden');
      this.button.classList.add('visible');
      this.isActive = true;
      console.log('[WhatsApp AI] Botão mostrado com sucesso!');
    }
  }

  hideButton() {
    if (this.button && this.isActive) {
      this.button.classList.remove('visible');
      this.button.classList.add('hidden');
      this.isActive = false;
    }
  }

  async generateResponse() {
    const hasApiKey = await this.ensureApiKeyConfigured();
    if (!hasApiKey) {
      this.showNotification('⚠️ Configure sua API Key da OpenAI primeiro!', 'error');
      return;
    }

    this.button.classList.add('loading');
    this.showNotification('🎵 Analisando conversa e transcrevendo áudios...', 'info');
    
    let audioCount = 0;
    let transcriptionErrors = [];
    
    try {
      const messages = await this.getLastMessagesWithAudio();
      
      if (messages.length === 0) {
        this.showNotification('⚠️ Nenhuma mensagem encontrada na conversa', 'error');
        return;
      }

      // Contar quantos áudios foram processados e erros
      audioCount = messages.filter(m => m.isAudio).length;
      transcriptionErrors = messages.filter(m => m.text.includes('[ÁUDIO - erro')).length;
      
      console.log(`[WhatsApp AI] Processadas ${messages.length} mensagens (${audioCount} áudios, ${transcriptionErrors} erros)`);

      const conversationHistory = messages.map(msg => 
        `${msg.sender}: ${msg.text}`
      ).join('\n');

      const prompt = `${this.settings.responseStyle}

Você é um assistente que gera respostas para conversas no WhatsApp.

Histórico da conversa:
${conversationHistory}

IMPORTANTE: Responda APENAS com a mensagem que deveria ser enviada. Não inclua explicações, contexto ou identificações como "Resposta:" ou similar. Apenas a resposta natural em português brasileiro:`;

      console.log('[WhatsApp AI] Enviando prompt para OpenAI...');
      const response = await this.callOpenAI(prompt);
      
      if (response) {
        const cleanResponse = response
          .replace(/^(Resposta:|Response:|Resposta da IA:|AI:|IA:)/i, '')
          .replace(/^[\s\-\:]+/, '')
          .trim();
          
        this.showResponseModal(cleanResponse);
        
        // Mensagem de sucesso baseada no resultado
        if (transcriptionErrors > 0) {
          this.showNotification(`⚠️ Resposta gerada! ${transcriptionErrors} erro(s) na transcrição`, 'warning');
        } else if (audioCount > 0) {
          this.showNotification(`✅ Resposta gerada! ${audioCount} áudio(s) transcrito(s)`, 'success');
        } else {
          this.showNotification('✅ Resposta gerada com sucesso!', 'success');
        }
      }
      
    } catch (error) {
      console.error('[WhatsApp AI] Erro completo:', error);
      
      let errorMessage = '❌ Erro ao gerar resposta.';
      
      if (error.message.includes('API key') || error.message.includes('401')) {
        errorMessage = '🔑 API Key inválida ou sem permissões para OpenAI/Whisper.';
      } else if (error.message.includes('429')) {
        errorMessage = '⏳ Limite de API atingido. Tente novamente em alguns minutos.';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage = '🌐 Erro de conexão. Verifique sua internet.';
      } else if (error.message.includes('transcrição')) {
        errorMessage = `🎵 Parece que deu erro na transcrição de áudios. Use debugTranscricaoCompleto() no console para diagnóstico.`;
      }
      
      this.showNotification(errorMessage, 'error');
      
      // Log para debug
      console.log('[WhatsApp AI] Para diagnóstico detalhado, execute no console:');
      console.log('debugTranscricaoCompleto()');
      
    } finally {
      this.button.classList.remove('loading');
    }
  }

  // Método auxiliar para buscar apenas mensagens de texto
  async getTextOnlyMessages(limit = 8) {
    const messages = [];
    const messageElements = document.querySelectorAll('[data-testid="msg-container"]');
    const lastMessages = Array.from(messageElements).slice(-limit);

    for (const msgElement of lastMessages) {
      const textElement = msgElement.querySelector('[data-testid="selectable-text"]');
      if (textElement && textElement.innerText.trim()) {
        const isOutgoing = Boolean(msgElement.querySelector('[data-testid="tail-out"]'));
        messages.push({
          text: textElement.innerText.trim(),
          isOutgoing,
          sender: isOutgoing ? 'Você' : 'Contato',
          isAudio: false
        });
      }
    }

    return messages;
  }

  async getLastMessagesWithAudio(limit = 8) {
    console.log('[WhatsApp AI] Buscando últimas mensagens e áudio disponível...');
    const messages = await this.getTextOnlyMessages(limit);

    try {
      const transcription = await this.transcribeAudio();
      if (transcription) {
        messages.push({
          text: `${transcription} (mensagem transcrita de áudio)`,
          isOutgoing: false,
          sender: 'Contato',
          isAudio: true
        });
      }
    } catch (error) {
      console.warn('[WhatsApp AI] Nenhum áudio transcrito. Continuando apenas com mensagens de texto.', error);
    }

    console.log(`[WhatsApp AI] Total: ${messages.length} mensagens processadas`);
    return messages;
  }

  isBlobLike(value) {
    if (!value) {
      return false;
    }

    const globalBlob = typeof Blob !== 'undefined' ? Blob : null;
    const windowBlob = typeof window !== 'undefined' && window.Blob ? window.Blob : null;
    const tag = Object.prototype.toString.call(value);

    return (
      (globalBlob && value instanceof globalBlob) ||
      (windowBlob && value instanceof windowBlob) ||
      tag === '[object Blob]' ||
      tag === '[object File]'
    );
  }

  isAudioReady(audioElement) {
    if (!audioElement) {
      return false;
    }

    const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
    const readyState = Number.isFinite(audioElement.readyState) ? audioElement.readyState : 0;
    return Boolean(audioElement.src) && (duration > 0 || readyState >= 2);
  }

  async ensureAudioReady(audioElement, timeoutMs = 3000) {
    if (!audioElement) {
      return;
    }

    if (this.isAudioReady(audioElement)) {
      return;
    }

    await new Promise((resolve) => {
      const cleanup = () => {
        clearTimeout(timer);
        audioElement.removeEventListener('loadedmetadata', onReady);
        audioElement.removeEventListener('loadeddata', onReady);
        audioElement.removeEventListener('canplay', onReady);
        audioElement.removeEventListener('canplaythrough', onReady);
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);

      audioElement.addEventListener('loadedmetadata', onReady, { once: true });
      audioElement.addEventListener('loadeddata', onReady, { once: true });
      audioElement.addEventListener('canplay', onReady, { once: true });
      audioElement.addEventListener('canplaythrough', onReady, { once: true });
    });
  }

  async fetchBlobFromAudioElement(audioElement) {
    if (!audioElement) {
      return null;
    }

    await this.ensureAudioReady(audioElement);

    const src = audioElement.currentSrc || audioElement.src;
    if (!src) {
      return null;
    }

    const response = await fetch(src, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Falha ao baixar áudio (${response.status})`);
    }

    return await response.blob();
  }

  async fetchBlobFromUrl(url) {
    if (!url) {
      return null;
    }

    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Falha ao baixar áudio (${response.status})`);
    }

    return await response.blob();
  }

  findPlayableAudioElementWithin(messageElement) {
    if (!messageElement) {
      return null;
    }

    const directAudios = Array.from(messageElement.querySelectorAll('audio')).reverse();
    if (directAudios.length > 0) {
      return directAudios[0];
    }

    const selectors = [
      '[data-testid="audio-play-button"]',
      '[data-testid="ptt-play-button"]',
      '[data-icon="audio-play"]',
      'button[aria-label*="Play"]',
      'button[aria-label*="Reproduzir"]'
    ];

    for (const selector of selectors) {
      const container = messageElement.querySelector(selector);
      if (!container) {
        continue;
      }

      const audioElement = container.querySelector('audio') || container.closest('[data-testid="msg-container"], [data-id]')?.querySelector('audio');
      if (audioElement) {
        return audioElement;
      }
    }

    return null;
  }

  findLatestAudioElement() {
    const candidates = Array.from(document.querySelectorAll('audio')).reverse();
    for (const audio of candidates) {
      if (!audio?.src) {
        continue;
      }

      const rect = typeof audio.getBoundingClientRect === 'function' ? audio.getBoundingClientRect() : { width: 0, height: 0 };
      const visible = audio.offsetParent !== null || (rect.width ?? 0) > 0 || (rect.height ?? 0) > 0;
      if (!visible) {
        continue;
      }

      return audio;
    }

    return null;
  }

  async waitForAudioElement(timeoutMs = 5000) {
    let resolved = this.findLatestAudioElement();
    if (resolved) {
      return resolved;
    }

    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;

      const cleanup = () => {
        clearTimeout(timer);
        observer.disconnect();
      };

      const check = () => {
        resolved = this.findLatestAudioElement();
        if (resolved) {
          cleanup();
          resolve(resolved);
        } else if (Date.now() > deadline) {
          cleanup();
          resolve(null);
        }
      };

      const observer = new MutationObserver(() => {
        check();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });

      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);

      check();
    });
  }

  async getLastVoiceBlob(timeoutMs = 5000) {
    let audioElement = this.findLatestAudioElement();
    if (!audioElement) {
      audioElement = await this.waitForAudioElement(timeoutMs);
    }

    if (!audioElement) {
      throw new Error('Áudio em mensagem: NAO ENCONTRADO');
    }

    await this.ensureAudioReady(audioElement, timeoutMs);
    const blob = await this.fetchBlobFromAudioElement(audioElement);
    return { blob, audioElement };
  }

  async transcribeAudio() {
    console.log('[WhatsApp AI] === INICIANDO TRANSCRIÇÃO DE ÁUDIO ===');

    try {
      update({ status: 'Procurando áudio...' });

      const storeResponse = await requestLastStoreAudioBlob();
      const normalized = await normalizeHelperBlob(storeResponse);

      if (!normalized || !normalized.blob) {
        throw new Error('Nenhum blob de áudio disponível');
      }

      update({ status: 'Enviando áudio para o Whisper...' });

      const mimeType = normalized.blob.type || normalized.metadata?.mimeType || 'audio/ogg';
      const transcription = await this.transcribeBlobWithWhisper(normalized.blob, mimeType);

      console.log('[WhatsApp AI] Transcrição concluída via Whisper');
      return transcription;
    } catch (error) {
      console.error('[WhatsApp AI] ERRO DETALHADO:', error);
      throw new Error(`Erro na transcrição: ${error.message}`);
    }
  }

  async transcribeBlobWithWhisper(audioBlob, mimeType = 'audio/ogg') {
    if (!this.isBlobLike(audioBlob)) {
      throw new Error('Fonte de áudio inválida');
    }

    const arrayBuffer = await audioBlob.arrayBuffer();
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSCRIBIR_AUDIO',
      arrayBuffer,
      mime: mimeType
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Falha na transcrição');
    }

    return response.text;
  }

  async callOpenAI(prompt) {
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_COMPLETION',
      prompt,
      model: this.settings.model
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Falha na geração da resposta');
    }

    return response.text?.trim?.() ?? response.text;
  }

  insertResponse(text) {
    console.log('[WhatsApp AI] Inserindo resposta...');
    
    const inputSelectors = [
      '[data-testid="compose-box-input"]',
      'div[contenteditable="true"][data-tab="10"]'
    ];
    
    let messageInput = null;
    
    for (const selector of inputSelectors) {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
        const placeholder = input.getAttribute('placeholder') || '';
        const isSearch = placeholder.toLowerCase().includes('pesquisar') || 
                        placeholder.toLowerCase().includes('search');
        
        if (!isSearch && input.offsetParent !== null) {
          messageInput = input;
          console.log(`[WhatsApp AI] Campo encontrado: ${selector}`);
          break;
        }
      }
      if (messageInput) break;
    }
    
    if (messageInput) {
      messageInput.focus();
      messageInput.textContent = text;
      
      // Dispara eventos
      messageInput.dispatchEvent(new Event('input', { bubbles: true }));
      messageInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('[WhatsApp AI] Texto inserido');
    } else {
      console.log('[WhatsApp AI] Campo de input não encontrado');
      this.showNotification('Campo de texto não encontrado', 'error');
    }
  }

  showResponseModal(response) {
    console.log('[WhatsApp AI] Exibindo modal...');
    
    const existingModal = document.querySelector('.whatsapp-ai-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'whatsapp-ai-modal';
    modal.innerHTML = `
      <div class="ai-modal-overlay">
        <div class="ai-modal-content">
          <div class="ai-modal-header">
            <h3>Resposta Gerada pela IA</h3>
            <button class="ai-modal-close">&times;</button>
          </div>
          <div class="ai-modal-body">
            <div class="ai-response-text">${response}</div>
          </div>
          <div class="ai-modal-footer">
            <button class="ai-btn ai-btn-copy">📄 Copiar</button>
            <button class="ai-btn ai-btn-use">✅ Usar</button>
            <button class="ai-btn ai-btn-new">🔄 Nova</button>
          </div>
        </div>
      </div>
    `;
    
    // Event listeners
    const closeBtn = modal.querySelector('.ai-modal-close');
    const overlay = modal.querySelector('.ai-modal-overlay');
    const copyBtn = modal.querySelector('.ai-btn-copy');
    const useBtn = modal.querySelector('.ai-btn-use');
    const newBtn = modal.querySelector('.ai-btn-new');
    
    const closeModal = () => modal.remove();
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    
    // Copiar texto
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(response);
        this.showNotification('Copiado!', 'success');
      } catch (error) {
        this.showNotification('Erro ao copiar', 'error');
      }
    });
    
    // Usar resposta
    useBtn.addEventListener('click', () => {
      this.insertResponse(response);
      closeModal();
    });
    
    // Gerar nova resposta
    newBtn.addEventListener('click', () => {
      closeModal();
      setTimeout(() => this.generateResponse(), 300);
    });
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 100);
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `whatsapp-ai-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// Inicialização
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[WhatsApp AI] DOM carregado, iniciando extensão...');
    new WhatsAppAIAssistant();
  });
} else {
  console.log('[WhatsApp AI] Página já carregada, iniciando extensão...');
  new WhatsAppAIAssistant();
}