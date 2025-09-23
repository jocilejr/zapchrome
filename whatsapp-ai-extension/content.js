if (!window.__uiUpdate) {
  window.__uiUpdate = (...args) => console.log('[UI update]', ...args);
}

const update = (...args) => window.__uiUpdate(...args);

// Aguarda um tempo (promessa)
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Força o WhatsApp a criar o <audio> clicando no play da mensagem
async function ensureAudioTagLoaded(messageElement) {
  if (!messageElement) {
    return;
  }

  const playButton = messageElement.querySelector(
    '[data-testid="audio-play-button"], [data-testid="ptt-play-button"], [data-icon="audio-play"], button[aria-label*="Reproduzir"], button[aria-label*="Play"]'
  );

  if (playButton) {
    try {
      playButton.click();
    } catch (error) {
      console.warn('[WhatsApp AI] Falha ao clicar no botão de play', error);
    }

    await sleep(350);

    const maybeAudio = messageElement.querySelector('audio');
    if (maybeAudio && !maybeAudio.paused) {
      try {
        maybeAudio.pause();
      } catch (pauseError) {
        console.warn('[WhatsApp AI] Falha ao pausar áudio forçado', pauseError);
      }
    }
  }
}

// Pega o último <audio> “real” carregado no DOM (fallback global)
function getLastGlobalAudioUrl() {
  const audios = Array.from(document.querySelectorAll('audio[src^="blob:"]'));
  if (audios.length === 0) {
    return null;
  }

  const last = audios[audios.length - 1];
  return last?.src || null;
}

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
    this.pageStoreListenerAttached = false;
    this.pageStoreScriptInjected = false;
    this.pageStoreBridgeReady = false;
    this.pageStoreBridgePromise = null;
    this.pageStoreBridgeResolve = null;
    this.pageStoreBridgeReject = null;
    this.pendingStoreRequests = new Map();
    this.handlePageStoreMessage = this.handlePageStoreMessage.bind(this);
    this.setupPageStoreMessaging();
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

  setupPageStoreMessaging() {
    if (this.pageStoreListenerAttached) {
      return;
    }

    window.addEventListener('message', this.handlePageStoreMessage, false);
    this.pageStoreListenerAttached = true;
  }

  handlePageStoreMessage(event) {
    if (!event || event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    if (data.type === 'WA_STORE_READY') {
      this.pageStoreBridgeReady = true;
      if (this.pageStoreBridgeResolve) {
        this.pageStoreBridgeResolve(true);
        this.pageStoreBridgeResolve = null;
        this.pageStoreBridgeReject = null;
      }
      return;
    }

    if (data.type === 'WA_STORE_RESPONSE') {
      const requestId = data.requestId;
      if (!requestId) {
        return;
      }

      const pending = this.pendingStoreRequests.get(requestId);
      if (!pending) {
        return;
      }

      this.pendingStoreRequests.delete(requestId);

      if (pending.timer) {
        clearTimeout(pending.timer);
      }

      if (data.success) {
        pending.resolve(data);
      } else {
        pending.reject(new Error(data.error || 'Ação do Store falhou'));
      }
    }
  }

  injectPageStoreScript() {
    if (this.pageStoreScriptInjected) {
      return;
    }

    const existing = document.querySelector('script[data-whatsapp-ai-page-store]');
    if (existing) {
      this.pageStoreScriptInjected = true;
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-store.js');
    script.async = true;
    script.dataset.whatsappAiPageStore = 'true';
    script.addEventListener('error', (error) => {
      console.error('[WhatsApp AI] Falha ao carregar helper do Store', error);
      if (this.pageStoreBridgeReject) {
        this.pageStoreBridgeReject(new Error('Falha ao carregar helper do Store'));
      }
    });

    const parent = document.head || document.documentElement || document.body;
    parent.appendChild(script);
    this.pageStoreScriptInjected = true;
  }

  async ensurePageStoreBridge(timeoutMs = 8000) {
    if (this.pageStoreBridgeReady) {
      return true;
    }

    this.setupPageStoreMessaging();
    this.injectPageStoreScript();

    if (this.pageStoreBridgePromise) {
      return this.pageStoreBridgePromise;
    }

    this.pageStoreBridgePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pageStoreBridgePromise = null;
        this.pageStoreBridgeResolve = null;
        this.pageStoreBridgeReject = null;
        reject(new Error('Timeout aguardando bridge do Store'));
      }, timeoutMs);

      this.pageStoreBridgeResolve = () => {
        clearTimeout(timer);
        this.pageStoreBridgePromise = null;
        this.pageStoreBridgeResolve = null;
        this.pageStoreBridgeReject = null;
        this.pageStoreBridgeReady = true;
        resolve(true);
      };

      this.pageStoreBridgeReject = (error) => {
        clearTimeout(timer);
        this.pageStoreBridgePromise = null;
        this.pageStoreBridgeResolve = null;
        this.pageStoreBridgeReject = null;
        reject(error);
      };
    });

    return this.pageStoreBridgePromise;
  }

  async ensureWhatsAppStore(timeoutMs = 12000) {
    try {
      await this.ensurePageStoreBridge(timeoutMs);
    } catch (error) {
      console.warn('[WhatsApp AI] Não foi possível iniciar bridge do Store', error);
      return false;
    }

    try {
      await this.requestPageStoreAction('ENSURE_STORE', {}, timeoutMs);
      return true;
    } catch (error) {
      console.warn('[WhatsApp AI] Falha ao garantir Store do WhatsApp', error);
      return false;
    }
  }

  async requestPageStoreAction(action, payload = {}, timeoutMs = 12000) {
    if (!action) {
      throw new Error('Ação inválida');
    }

    await this.ensurePageStoreBridge(timeoutMs);

    const requestId = `wa_store_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingStoreRequests.delete(requestId);
        reject(new Error(`Timeout na ação ${action}`));
      }, timeoutMs);

      this.pendingStoreRequests.set(requestId, {
        resolve,
        reject,
        timer
      });

      window.postMessage(
        {
          type: 'WA_STORE_REQUEST',
          action,
          requestId,
          ...payload
        },
        '*'
      );
    });
  }

  extractMessageIdFromElement(element) {
    let current = element;
    while (current && current !== document.body) {
      if (current.dataset?.id) {
        return current.dataset.id;
      }

      const dataId = current.getAttribute?.('data-id');
      if (dataId) {
        return dataId;
      }

      const ariaOwns = current.getAttribute?.('aria-owns');
      if (ariaOwns) {
        return ariaOwns;
      }

      current = current.parentElement;
    }

    return null;
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
        const isOutgoing = msgElement.querySelector('[data-testid="tail-out"]');
        const sender = isOutgoing ? 'Você' : 'Contato';
        messages.push(`${sender}: ${textElement.innerText.trim()}`);
      }
    }
    
    return messages;
  }

  async getLastMessagesWithAudio(limit = 8) {
    console.log('[WhatsApp AI] Buscando mensagens com transcrição de áudio...');
    const messages = [];
    
    // Seletores mais abrangentes para mensagens
    const messageSelectors = [
      '[data-testid="msg-container"]',
      '[data-testid="conversation-panel-messages"] > div > div',
      '.message-in, .message-out',
      '[class*="message"]'
    ];
    
    let messageElements = [];
    
    // Tentar encontrar mensagens com seletores diferentes
    for (const selector of messageSelectors) {
      messageElements = document.querySelectorAll(selector);
      if (messageElements.length > 0) {
        console.log(`[WhatsApp AI] ${messageElements.length} mensagens encontradas com seletor: ${selector}`);
        break;
      }
    }
    
    if (messageElements.length === 0) {
      console.log('[WhatsApp AI] Nenhuma mensagem encontrada - tentando método alternativo');
      
      // Método alternativo: buscar por área de mensagens
      const chatArea = document.querySelector('[data-testid="conversation-panel-messages"]') ||
                      document.querySelector('#main') ||
                      document.querySelector('[class*="chat"]');
      
      if (chatArea) {
        messageElements = chatArea.querySelectorAll('div[class*="message"], div[data-id]');
        console.log(`[WhatsApp AI] Método alternativo encontrou ${messageElements.length} elementos`);
      }
    }
    
    if (messageElements.length === 0) {
      console.log('[WhatsApp AI] Nenhuma mensagem encontrada');
      return messages;
    }
    
    // Pega as últimas mensagens
    const lastMessages = Array.from(messageElements).slice(-limit);
    console.log(`[WhatsApp AI] Processando últimas ${lastMessages.length} mensagens`);
    
    for (let index = 0; index < lastMessages.length; index++) {
      const msgElement = lastMessages[index];
      
      // Determinar se é mensagem enviada ou recebida
      const isOutgoing = msgElement.classList.contains('message-out') || 
                        msgElement.querySelector('[data-testid="tail-out"]') ||
                        msgElement.closest('.message-out') ||
                        msgElement.querySelector('[data-icon="msg-time"]')?.closest('[class*="out"]');
      
      // Seletores mais abrangentes para áudio
      const audioSelectors = [
        '[data-testid="audio-play-button"]',
        '[data-testid="ptt-play-button"]',
        '[data-icon="audio-play"]',
        '.audio-play-button',
        'button[aria-label*="Play"]',
        'button[aria-label*="Reproduzir"]',
        '[class*="audio"] button',
        'audio'
      ];
      
      let audioElement = null;
      for (const selector of audioSelectors) {
        audioElement = msgElement.querySelector(selector);
        if (audioElement) {
          console.log(`[WhatsApp AI] Áudio encontrado com seletor: ${selector}`);
          break;
        }
      }
      
      if (audioElement) {
        console.log(`[WhatsApp AI] Encontrado áudio na mensagem ${index + 1}, transcrevendo...`);
        
        try {
          const transcription = await this.transcribeAudio(msgElement);
          
          messages.push({
            text: `${transcription} (mensagem transcrita de áudio)`,
            isOutgoing: !!isOutgoing,
            sender: isOutgoing ? 'Você' : 'Contato',
            isAudio: true
          });
          
          console.log(`[WhatsApp AI] Áudio transcrito: ${transcription.substring(0, 50)}...`);
        } catch (error) {
          console.error('[WhatsApp AI] Erro na transcrição:', error);
          
          // Mensagem de fallback mais informativa
          const errorMsg = error.message.includes('API key') ? 
            '[ÁUDIO - erro na API Key]' : 
            '[ÁUDIO - erro na transcrição]';
            
          messages.push({
            text: errorMsg,
            isOutgoing: !!isOutgoing,
            sender: isOutgoing ? 'Você' : 'Contato',
            isAudio: true
          });
        }
        continue;
      }
      
      // Mensagens de texto normais - seletores mais abrangentes
      const textSelectors = [
        '[data-testid="selectable-text"]',
        '.selectable-text',
        '[class*="selectable"]',
        '.copyable-text',
        '[class*="copyable"]',
        'span[dir="ltr"]',
        '[class*="text"] span'
      ];
      
      let textElement = null;
      for (const selector of textSelectors) {
        textElement = msgElement.querySelector(selector);
        if (textElement && textElement.innerText.trim()) {
          break;
        }
      }
      
      if (textElement) {
        const text = textElement.innerText.trim();
        if (text && text.length > 0) {
          messages.push({
            text: text,
            isOutgoing: !!isOutgoing,
            sender: isOutgoing ? 'Você' : 'Contato',
            isAudio: false
          });
          console.log(`[WhatsApp AI] Mensagem texto ${index + 1}: ${text.substring(0, 50)}...`);
        }
      } else {
        // Fallback para texto
        const fallbackText = msgElement.innerText?.trim();
        if (fallbackText && fallbackText.length > 0 && !fallbackText.includes('WhatsApp')) {
          messages.push({
            text: fallbackText,
            isOutgoing: !!isOutgoing,
            sender: isOutgoing ? 'Você' : 'Contato',
            isAudio: false
          });
          console.log(`[WhatsApp AI] Texto fallback ${index + 1}: ${fallbackText.substring(0, 50)}...`);
        }
      }
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

  async normalizeHelperBlob(helperResponse) {
    if (!helperResponse) {
      return null;
    }

    const metadata = helperResponse.metadata ? { ...helperResponse.metadata } : {};
    let blobCandidate = helperResponse.blob;

    const unwrap = (candidate) => {
      if (this.isBlobLike(candidate)) {
        return candidate;
      }

      if (candidate?.blob && this.isBlobLike(candidate.blob)) {
        return candidate.blob;
      }

      if (candidate?._blob && this.isBlobLike(candidate._blob)) {
        return candidate._blob;
      }

      if (candidate?.data && this.isBlobLike(candidate.data)) {
        return candidate.data;
      }

      return candidate;
    };

    blobCandidate = unwrap(blobCandidate);

    if (blobCandidate && typeof blobCandidate === 'string') {
      const dataUrlMatch = /^data:([^;]+);base64,(.+)$/i.exec(blobCandidate);
      if (dataUrlMatch) {
        try {
          const mimeType = dataUrlMatch[1] || metadata.mimeType || 'audio/ogg';
          const binary = atob(dataUrlMatch[2]);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          blobCandidate = new Blob([bytes], { type: mimeType });
          metadata.mimeType = mimeType;
        } catch (error) {
          console.warn('[WhatsApp AI] Falha ao decodificar base64 do helper', error);
          return null;
        }
      } else if (/^blob:/.test(blobCandidate) || /^https?:/.test(blobCandidate)) {
        metadata.blobUrl = metadata.blobUrl || blobCandidate;
        blobCandidate = await this.fetchBlobFromUrl(blobCandidate);
      } else {
        try {
          const binary = atob(blobCandidate);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          blobCandidate = new Blob([bytes], { type: metadata.mimeType || 'audio/ogg' });
        } catch (error) {
          console.warn('[WhatsApp AI] String de blob desconhecida recebida do helper', error);
          return null;
        }
      }
    }

    if (blobCandidate && blobCandidate.buffer && blobCandidate.byteLength >= 0 && !this.isBlobLike(blobCandidate)) {
      const type = metadata.mimeType || 'audio/ogg';
      blobCandidate = new Blob([blobCandidate.buffer ? blobCandidate : new Uint8Array(blobCandidate)], { type });
    }

    blobCandidate = unwrap(blobCandidate);

    if (!this.isBlobLike(blobCandidate)) {
      return null;
    }

    if (!metadata.mimeType && blobCandidate.type) {
      metadata.mimeType = blobCandidate.type;
    }

    if (!metadata.blobUrl && (metadata.src || metadata.downloadUrl)) {
      metadata.blobUrl = metadata.src || metadata.downloadUrl;
    }

    return { blob: blobCandidate, metadata };
  }

  resolveAudioSource(audioElement) {
    if (!audioElement) {
      return null;
    }

    return audioElement.currentSrc || audioElement.src || null;
  }

  findAudioInMessage(messageElement) {
    if (!messageElement) {
      return null;
    }

    const link = messageElement.querySelector('a[href^="blob:"], a[href^="data:audio"], a[href*="whatsapp.net"]');
    if (link?.href) {
      return { src: link.href };
    }

    const source = messageElement.querySelector('audio source[src], video source[src]');
    if (source?.src) {
      return { src: source.src };
    }

    const container = messageElement.querySelector(
      '[data-testid="audio-play-button"], [data-testid="ptt-play-button"], [data-icon="audio-play"], button[aria-label*="Reproduzir"], button[aria-label*="Play"]'
    );
    if (container) {
      const hostMessage = container.closest('[data-testid="msg-container"], [data-id]');
      const nestedAudio = hostMessage?.querySelector?.('audio') || container.querySelector('audio');
      const src = this.resolveAudioSource(nestedAudio);
      if (src) {
        return { src };
      }
    }

    return null;
  }

  findRecentAudioBlob() {
    if (this.lastKnownAudioSrc) {
      return this.lastKnownAudioSrc;
    }

    const latest = this.findLatestAudioElement();
    if (latest) {
      return this.resolveAudioSource(latest);
    }

    return null;
  }

  async extractAudioWithoutPlay(messageElement) {
    if (!messageElement) {
      return null;
    }

    const dataAttr = messageElement.getAttribute('data-audio-src') || messageElement.dataset?.audioSrc;
    if (dataAttr) {
      return dataAttr;
    }

    const source = messageElement.querySelector('source[src], track[src]');
    if (source?.src) {
      return source.src;
    }

    const downloadable = messageElement.querySelector('a[href*=".opus"], a[href*=".ogg"], a[href*=".mp3"], a[href*=".m4a"], a[href*=".mp4"]');
    if (downloadable?.href) {
      return downloadable.href;
    }

    return null;
  }

  async processAudioBlob(source, mimeHint, metadata = {}) {
    if (!source) {
      return null;
    }

    let blob = null;

    if (this.isBlobLike(source)) {
      blob = source;
    } else if (typeof source === 'string') {
      blob = await this.fetchBlobFromUrl(source);
    } else if (source && this.isBlobLike(source.blob)) {
      blob = source.blob;
      if (!mimeHint) {
        mimeHint = source.blob.type;
      }
    }

    if (!blob || !this.isBlobLike(blob)) {
      throw new Error('Fonte de áudio inválida');
    }

    const mimeType = mimeHint || metadata?.mimeType || blob.type || 'audio/ogg';

    update({ status: 'Enviando para o Whisper...' });
    const transcription = await this.transcribeBlobWithWhisper(blob, mimeType);
    update({ status: 'Transcrição concluída', transcript: transcription });
    return transcription;
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

  async transcribeAudio(messageElement) {
    console.log('[WhatsApp AI] === INICIANDO TRANSCRIÇÃO DE ÁUDIO ===');

    try {
      update({ status: 'Procurando áudio...' });

      const messageId = this.extractMessageIdFromElement(messageElement);
      let helperResult = null;
      let normalizedHelper = null;

      let storeReady = false;
      try {
        storeReady = await this.ensureWhatsAppStore();
      } catch (storeError) {
        console.warn('[WhatsApp AI] Store indisponível para recuperar áudio', storeError);
      }

      if (storeReady) {
        if (messageId) {
          try {
            helperResult = await this.requestPageStoreAction('GET_AUDIO_BLOB', { messageId }, 12000);
          } catch (error) {
            console.warn('[WhatsApp AI] Falha ao buscar blob pelo Store com messageId', messageId, error);
          }
        }

        if (!helperResult?.blob) {
          try {
            helperResult = await this.requestPageStoreAction('GET_LAST_AUDIO_BLOB', {}, 12000);
          } catch (error) {
            console.warn('[WhatsApp AI] Falha ao obter último áudio via Store', error);
          }
        }
      }

      if (helperResult?.blob) {
        try {
          normalizedHelper = await this.normalizeHelperBlob(helperResult);
        } catch (error) {
          console.warn('[WhatsApp AI] Falha ao normalizar blob recebido do helper', error);
        }
      }

      if (normalizedHelper?.blob) {
        const helperSrc =
          normalizedHelper.metadata?.blobUrl ||
          normalizedHelper.metadata?.src ||
          normalizedHelper.metadata?.downloadUrl ||
          null;

        if (helperSrc) {
          this.lastKnownAudioSrc = helperSrc;
        }

        return await this.processAudioBlob(
          normalizedHelper.blob,
          normalizedHelper.metadata?.mimeType,
          normalizedHelper.metadata
        );
      }

      // === TENTA 1: <audio> direto na mensagem ===
      let audioElement = messageElement?.querySelector?.('audio') || null;
      if (!audioElement) {
        await ensureAudioTagLoaded(messageElement);
        audioElement = messageElement?.querySelector?.('audio') || null;
      }

      let src = this.resolveAudioSource(audioElement);
      if (src) {
        this.lastKnownAudioSrc = src;
        return await this.processAudioBlob(src);
      }

      // === TENTA 2: procurar estruturas dentro da mensagem ===
      const audioData = this.findAudioInMessage?.(messageElement);
      if (audioData?.src) {
        this.lastKnownAudioSrc = audioData.src;
        return await this.processAudioBlob(audioData.src);
      }

      // === TENTA 3: blob recente (varredura da página) ===
      let recent = this.findRecentAudioBlob?.();
      if (!recent) {
        await ensureAudioTagLoaded(messageElement);
        recent = this.findRecentAudioBlob?.();
      }
      if (recent) {
        this.lastKnownAudioSrc = recent;
        return await this.processAudioBlob(recent);
      }

      // === TENTA 4: extração sem reproduzir (links/source próximos) ===
      const extracted = await this.extractAudioWithoutPlay?.(messageElement);
      if (extracted) {
        this.lastKnownAudioSrc = extracted;
        return await this.processAudioBlob(extracted);
      }

      // === ÚLTIMO RECURSO: pega o último <audio> global criado no DOM ===
      const globalBlobUrl = getLastGlobalAudioUrl();
      if (globalBlobUrl) {
        this.lastKnownAudioSrc = globalBlobUrl;
        return await this.processAudioBlob(globalBlobUrl);
      }

      throw new Error('Nenhum arquivo de áudio encontrado para transcrever');
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