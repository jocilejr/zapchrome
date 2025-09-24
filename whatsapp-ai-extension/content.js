class WhatsAppAIAssistant {
  constructor() {
    this.isActive = false;
    this.button = null;
    this.labelButton = null;
    this.settings = {
      model: 'gpt-4o',
      responseStyle: 'Responda de forma natural e contextual, mantendo o tom da conversa'
    };
    this.apiKeyConfigured = false;
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

    const inputSelectors = [
      '[data-testid="compose-box-input"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"]'
    ];

    let messageInput = null;

    for (const selector of inputSelectors) {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
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

    if (isConversationOpen) {
      if (!this.isActive) {
        console.log('[WhatsApp AI] Mostrando botão...');
        this.showButton();
      }
    } else {
      console.log('[WhatsApp AI] Nenhuma conversa ativa, removendo integrações...');

      if (this.isActive) {
        this.hideButton();
      }
    }
  }

  createFloatingButton() {
    if (this.button) return;

    console.log('[WhatsApp AI] Criando botão flutuante...');

    this.button = document.createElement('div');
    this.button.className = 'whatsapp-ai-floating-wrapper hidden';
    this.button.innerHTML = `
add-label-above-floating-button-otf8ip
      <button type="button" class="whatsapp-ai-button whatsapp-ai-ask-button" aria-label="Abrir pergunta personalizada da inteligência artificial">
        <div class="ai-button-content">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M12 17V17.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M12 13.5C12 11.8431 13.3431 10.5 15 10.5C16.6569 10.5 18 11.8431 18 13.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6.5 9.5C7.60457 8.39543 9.20827 8 10.709 8.41421" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="ai-button-tooltip">Pergunte a I.A</div>
      </button>
      <button type="button" class="whatsapp-ai-button whatsapp-ai-generate-button" aria-label="Gerar resposta com inteligência artificial">

        <div class="ai-button-content">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="ai-button-tooltip">Gerar Resposta com IA</div>
      </button>
    `;

add-label-above-floating-button-otf8ip
    const triggerButton = this.button.querySelector('.whatsapp-ai-generate-button');
    const labelButton = this.button.querySelector('.whatsapp-ai-ask-button');


    triggerButton?.addEventListener('click', () => {
      console.log('[WhatsApp AI] Botão clicado!');
      this.generateResponse();
    });

    labelButton?.addEventListener('click', async () => {
      console.log('[WhatsApp AI] Abertura de pergunta personalizada solicitada');
      const hasApiKey = await this.ensureApiKeyConfigured();
      if (!hasApiKey) {
        this.showNotification('⚠️ Configure sua API Key da OpenAI primeiro!', 'error');
        return;
      }

      this.openCustomQuestionModal();
    });

    this.buttonTrigger = triggerButton;
    this.labelButton = labelButton;

    document.body.appendChild(this.button);
    console.log('[WhatsApp AI] Botão criado e adicionado ao DOM');

    window.showAIButton = () => {
      console.log('[WhatsApp AI] Forçando exibição do botão...');
      this.showButton();
    };

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

    if (this.buttonTrigger) {
      this.buttonTrigger.classList.add('loading');
    }
    this.showNotification('✍️ Analisando conversa recente...', 'info');

    try {
      const messages = await this.getRecentTextMessages();

      if (messages.length === 0) {
        this.showNotification('⚠️ Nenhuma mensagem de texto encontrada na conversa', 'error');
        return;
      }

      const conversationHistory = messages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');

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
        this.showNotification('✅ Resposta gerada com sucesso!', 'success');
      }
    } catch (error) {
      console.error('[WhatsApp AI] Erro completo:', error);

      let errorMessage = '❌ Erro ao gerar resposta.';

      if (error.message.includes('API key') || error.message.includes('401')) {
        errorMessage = '🔑 API Key inválida ou sem permissões para OpenAI.';
      } else if (error.message.includes('429')) {
        errorMessage = '⏳ Limite de API atingido. Tente novamente em alguns minutos.';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage = '🌐 Erro de conexão. Verifique sua internet.';
      }

      this.showNotification(errorMessage, 'error');
    } finally {
      if (this.buttonTrigger) {
        this.buttonTrigger.classList.remove('loading');
      }
    }
  }

  async getRecentTextMessages(limit = 8) {
    const messages = [];
    const messageSelectors = [
      '[data-testid="msg-container"]',
      '[data-testid="conversation-panel-messages"] > div > div',
      '.message-in',
      '.message-out'
    ];

    let messageElements = [];
    for (const selector of messageSelectors) {
      messageElements = document.querySelectorAll(selector);
      if (messageElements.length > 0) {
        break;
      }
    }

    if (messageElements.length === 0) {
      return messages;
    }

    const lastMessages = Array.from(messageElements).slice(-limit);

    for (const msgElement of lastMessages) {
      const textSelectors = [
        '[data-testid="selectable-text"]',
        '.selectable-text',
        '[class*="selectable"]',
        'span[dir="auto"]'
      ];

      const textParts = [];
      for (const selector of textSelectors) {
        const nodes = msgElement.querySelectorAll(selector);
        for (const node of nodes) {
          const value = node.innerText?.trim();
          if (value) {
            textParts.push(value);
          }
        }
      }

      const text = textParts.join(' ').replace(/\s+/g, ' ').trim();
      if (!text) {
        continue;
      }

      const isOutgoing = msgElement.classList.contains('message-out') ||
                        msgElement.querySelector('[data-testid="tail-out"]') ||
                        msgElement.closest('.message-out') ||
                        msgElement.querySelector('[data-icon="msg-time"]')?.closest('[class*="out"]');

      messages.push({
        text,
        sender: isOutgoing ? 'Você' : 'Contato'
      });
    }

    return messages;
  }

  async getTextOnlyMessages(limit = 8) {
    const rawMessages = await this.getRecentTextMessages(limit);
    return rawMessages.map(msg => `${msg.sender}: ${msg.text}`);
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

  async askCustomQuestion(question, { includeContext = true } = {}) {
    const trimmedQuestion = question?.trim?.();
    if (!trimmedQuestion) {
      throw new Error('Digite uma pergunta para a IA.');
    }

    const hasApiKey = await this.ensureApiKeyConfigured();
    if (!hasApiKey) {
      throw new Error('Configure sua API Key da OpenAI no popup da extensão.');
    }

    const promptParts = [];

    if (this.settings?.responseStyle) {
      promptParts.push(this.settings.responseStyle);
    }

    if (includeContext) {
      const contextMessages = await this.getTextOnlyMessages(10);
      if (contextMessages.length > 0) {
        promptParts.push('Contexto recente da conversa no WhatsApp:');
        promptParts.push(contextMessages.join('\n'));
      }
    }

    promptParts.push('Pergunta personalizada do usuário:');
    promptParts.push(trimmedQuestion);
    promptParts.push('Responda de forma clara e útil em português brasileiro.');

    const prompt = promptParts.join('\n\n');
    return this.callOpenAI(prompt);
  }

  openCustomQuestionModal() {
    const existingModal = document.querySelector('.whatsapp-ai-custom-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'whatsapp-ai-modal whatsapp-ai-custom-modal';
    modal.innerHTML = `
      <div class="ai-modal-overlay">
        <div class="ai-modal-content">
          <div class="ai-modal-header">
            <h3>Perguntar à IA</h3>
            <button class="ai-modal-close" type="button">&times;</button>
          </div>
          <div class="ai-modal-body ai-custom-body">
            <label class="ai-custom-label" for="whatsapp-ai-custom-question">Digite sua pergunta personalizada:</label>
            <textarea id="whatsapp-ai-custom-question" class="ai-custom-question" rows="5" placeholder="Ex: Qual a melhor forma de responder a última mensagem?" ></textarea>
            <label class="ai-custom-context">
              <input type="checkbox" class="ai-custom-context-checkbox" checked />
              Incluir as últimas mensagens de texto como contexto
            </label>
            <div class="ai-custom-status" role="status"></div>
            <div class="ai-custom-result hidden">
              <div class="ai-response-text"></div>
              <div class="ai-custom-actions">
                <button class="ai-btn ai-custom-copy" type="button">📄 Copiar</button>
                <button class="ai-btn ai-custom-use" type="button">✅ Usar no chat</button>
              </div>
            </div>
          </div>
          <div class="ai-modal-footer ai-custom-footer">
            <button class="ai-btn ai-custom-submit" type="button">Perguntar</button>
          </div>
        </div>
      </div>
    `;

    const closeButton = modal.querySelector('.ai-modal-close');
    const overlay = modal.querySelector('.ai-modal-overlay');
    const submitButton = modal.querySelector('.ai-custom-submit');
    const questionField = modal.querySelector('.ai-custom-question');
    const statusField = modal.querySelector('.ai-custom-status');
    const resultWrapper = modal.querySelector('.ai-custom-result');
    const resultText = modal.querySelector('.ai-custom-result .ai-response-text');
    const contextCheckbox = modal.querySelector('.ai-custom-context-checkbox');
    const copyButton = modal.querySelector('.ai-custom-copy');
    const useButton = modal.querySelector('.ai-custom-use');

    const closeModal = () => modal.remove();
    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });

    const setLoading = (loading) => {
      if (loading) {
        submitButton.setAttribute('disabled', 'disabled');
        submitButton.textContent = 'Consultando...';
        statusField.textContent = 'Consultando a IA...';
        statusField.classList.remove('error', 'success');
        resultWrapper.classList.add('hidden');
      } else {
        submitButton.removeAttribute('disabled');
        submitButton.textContent = 'Perguntar';
      }
    };

    const handleSubmit = async () => {
      const question = questionField.value;
      const includeContext = contextCheckbox.checked;

      if (!question.trim()) {
        statusField.textContent = 'Digite uma pergunta para continuar.';
        statusField.classList.add('error');
        return;
      }

      try {
        setLoading(true);
        const answer = await this.askCustomQuestion(question, { includeContext });
        resultText.textContent = answer;
        resultWrapper.classList.remove('hidden');
        statusField.textContent = 'Resposta pronta!';
        statusField.classList.add('success');
      } catch (error) {
        console.error('[WhatsApp AI] Erro na pergunta personalizada:', error);
        statusField.textContent = error?.message || 'Não foi possível consultar a IA.';
        statusField.classList.add('error');
      } finally {
        setLoading(false);
      }
    };

    submitButton.addEventListener('click', handleSubmit);
    questionField.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSubmit();
      }
    });

    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(resultText.textContent || '');
        statusField.textContent = 'Resposta copiada para a área de transferência!';
        statusField.classList.add('success');
      } catch (error) {
        statusField.textContent = 'Não foi possível copiar o texto.';
        statusField.classList.add('error');
      }
    });

    useButton.addEventListener('click', () => {
      const text = resultText.textContent || '';
      if (!text) {
        statusField.textContent = 'Gere uma resposta antes de usar no chat.';
        statusField.classList.add('error');
        return;
      }

      this.insertResponse(text);
      statusField.textContent = 'Texto inserido no campo de mensagem.';
      statusField.classList.add('success');
    });

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 100);
    questionField.focus();
  }

  insertResponse(text) {
    const inputSelectors = [
      '[data-testid="compose-box-input"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"]'
    ];

    let messageInput = null;

    for (const selector of inputSelectors) {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
        const placeholder = input.getAttribute('placeholder') || '';
        const isSearch = placeholder.toLowerCase().includes('pesquisar') ||
                        placeholder.toLowerCase().includes('search') ||
                        input.closest('[data-testid="chat-list-search"]');

        if (!isSearch && input.offsetParent !== null) {
          messageInput = input;
          break;
        }
      }
      if (messageInput) break;
    }

    if (messageInput) {
      const selection = window.getSelection();
      if (selection && typeof selection.removeAllRanges === 'function') {
        selection.removeAllRanges();
      }

      const range = document.createRange();
      range.selectNodeContents(messageInput);
      range.collapse(false);
      selection?.addRange?.(range);

      let insertedWithCommand = false;

      if (document.queryCommandSupported('insertText')) {
        try {
          insertedWithCommand = document.execCommand('insertText', false, text);
          console.log('[WhatsApp AI] insertText via execCommand', insertedWithCommand ? 'sucesso' : 'falhou');
        } catch (error) {
          console.warn('[WhatsApp AI] execCommand insertText falhou', error);
        }
      }

      if (!insertedWithCommand) {
        messageInput.textContent = text;
        console.log('[WhatsApp AI] Fallback via atribuição direta aplicado');
      }

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

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(response);
        this.showNotification('Copiado!', 'success');
      } catch (error) {
        this.showNotification('Erro ao copiar', 'error');
      }
    });

    useBtn.addEventListener('click', () => {
      this.insertResponse(response);
      closeModal();
    });

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[WhatsApp AI] DOM carregado, iniciando extensão...');
    new WhatsAppAIAssistant();
  });
} else {
  console.log('[WhatsApp AI] Página já carregada, iniciando extensão...');
  new WhatsAppAIAssistant();
}
