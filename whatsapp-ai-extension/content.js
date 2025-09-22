// WhatsApp AI Assistant Content Script - Versão Limpa
class WhatsAppAIAssistant {
  constructor() {
    this.isActive = false;
    this.button = null;
    this.settings = {
      apiKey: '',
      model: 'gpt-4o',
      responseStyle: 'Responda de forma natural e contextual, mantendo o tom da conversa'
    };
    console.log('[WhatsApp AI] Construtor iniciado');
    this.init();
  }

  async init() {
    console.log('[WhatsApp AI] Inicializando...');
    await this.loadSettings();
    this.createFloatingButton();
    this.observeConversationChanges();
    
    // Expor instância globalmente para debug
    window.whatsappAI = this;
    console.log('[WhatsApp AI] Inicialização completa');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['apiKey', 'model', 'responseStyle']);
      this.settings = {
        apiKey: result.apiKey || '',
        model: result.model || 'gpt-4o',
        responseStyle: result.responseStyle || 'Responda de forma natural e contextual, mantendo o tom da conversa'
      };
    } catch (error) {
      console.log('Erro ao carregar configurações:', error);
    }
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
    if (!this.settings.apiKey) {
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

  getMessageIdFromElement(messageElement) {
    if (!messageElement) return null;

    const directId = messageElement.dataset?.id || messageElement.getAttribute?.('data-id');
    if (directId) return directId;

    const nestedWithId = messageElement.querySelector?.('[data-id]');
    if (nestedWithId) {
      return nestedWithId.dataset?.id || nestedWithId.getAttribute('data-id');
    }

    const ariaOwns = messageElement.getAttribute?.('aria-owns');
    if (ariaOwns) return ariaOwns;

    return null;
  }

  async ensureWhatsAppStore() {
    if (this._whatsAppStorePromise) {
      return this._whatsAppStorePromise;
    }

    if (window.Store?.Msg) {
      this._whatsAppStorePromise = Promise.resolve(window.Store);
      return this._whatsAppStorePromise;
    }

    const promise = new Promise((resolve, reject) => {
      const chunk = window.webpackChunkwhatsapp_web_client;
      if (!chunk || typeof chunk.push !== 'function') {
        reject(new Error('webpackChunkwhatsapp_web_client não encontrado'));
        return;
      }

      const moduleId = `__wa_store_${Date.now()}`;

      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao carregar Store do WhatsApp'));
      }, 5000);

      try {
        chunk.push([
          [moduleId],
          {},
          (__webpack_require__) => {
            try {
              const moduleMap = __webpack_require__.m || {};
              for (const key of Object.keys(moduleMap)) {
                try {
                  const module = __webpack_require__(key);
                  const candidate = module?.default?.Msg ? module.default : module;
                  if (candidate?.Msg) {
                    window.Store = candidate;
                    clearTimeout(timeout);
                    resolve(candidate);
                    return;
                  }
                } catch (innerError) {
                  console.warn('[WhatsApp AI] Erro ao avaliar módulo WhatsApp', innerError);
                }
              }
              clearTimeout(timeout);
              reject(new Error('Store.Msg não encontrado nos módulos do WhatsApp'));
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
            }
          }
        ]);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });

    this._whatsAppStorePromise = promise.catch(error => {
      this._whatsAppStorePromise = null;
      throw error;
    });

    return this._whatsAppStorePromise;
  }

  async getWhatsAppMessageById(messageId) {
    try {
      const store = await this.ensureWhatsAppStore();
      if (!store?.Msg) return null;
      const message = store.Msg.get?.(messageId) || store.Msg.find?.(msg => msg?.id?._serialized === messageId || msg?.id === messageId);
      return message || null;
    } catch (error) {
      console.warn('[WhatsApp AI] Não foi possível obter Store.Msg', error);
      return null;
    }
  }

  async transcribeAudio(messageElement) {
    console.log('[WhatsApp AI] === INICIANDO TRANSCRIÇÃO DE ÁUDIO ===');

    try {
      const messageId = this.getMessageIdFromElement(messageElement);
      if (messageId) {
        console.log(`[WhatsApp AI] Tentando obter mídia via Store para mensagem ${messageId}`);
        try {
          const storeMessage = await this.getWhatsAppMessageById(messageId);
          if (storeMessage?.mediaData) {
            if (!storeMessage.mediaData.mediaBlob && !storeMessage.mediaData._mediaBlob && !storeMessage.mediaData.blob) {
              console.log('[WhatsApp AI] Blob não carregado, tentando download interno...');
              try {
                if (typeof storeMessage.downloadMedia === 'function') {
                  await storeMessage.downloadMedia();
                } else {
                  throw new Error('Método downloadMedia indisponível');
                }
              } catch (downloadError) {
                console.warn('[WhatsApp AI] Falha ao baixar mídia internamente', downloadError);
                this.showNotification('⚠️ Não foi possível baixar o áudio internamente. Tentando métodos alternativos...', 'warning');
              }
            }

            const internalBlob =
              storeMessage.mediaData.mediaBlob ||
              storeMessage.mediaData._mediaBlob ||
              storeMessage.mediaData.blob ||
              storeMessage.mediaData.file ||
              storeMessage.mediaData?.mediaBlobUrl;

            let blobForProcessing = null;
            if (internalBlob instanceof Blob) {
              blobForProcessing = internalBlob;
            } else if (internalBlob?.blob instanceof Blob) {
              blobForProcessing = internalBlob.blob;
            } else if (typeof internalBlob === 'string' && internalBlob.startsWith('blob:')) {
              console.log('[WhatsApp AI] URL de blob interno encontrada');
              return await this.processAudioBlob(internalBlob);
            }

            if (blobForProcessing) {
              console.log('[WhatsApp AI] Áudio obtido via Store');
              const audioFile = blobForProcessing instanceof File
                ? blobForProcessing
                : new File([blobForProcessing], 'whatsapp-audio.ogg', {
                    type: blobForProcessing.type || storeMessage.mediaData?.type || 'audio/ogg'
                  });

              const objectUrl = URL.createObjectURL(audioFile);
              try {
                return await this.processAudioBlob(objectUrl);
              } finally {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
              }
            }
          }
        } catch (storeError) {
          console.warn('[WhatsApp AI] Falha ao obter mídia via Store', storeError);
          this.showNotification('⚠️ Não foi possível acessar o áudio internamente. Tentando métodos alternativos...', 'warning');
        }
      }

      // Método 1: Buscar elemento audio diretamente na mensagem
      let audioElement = messageElement.querySelector('audio');
      console.log(`[WhatsApp AI] Áudio na mensagem: ${audioElement ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);

      if (audioElement && audioElement.src && audioElement.src.startsWith('blob:')) {
        console.log(`[WhatsApp AI] Usando áudio da mensagem: ${audioElement.src.substring(0, 50)}...`);
        return await this.processAudioBlob(audioElement.src);
      }
      
      // Método 2: Buscar na estrutura do WhatsApp sem reproduzir
      const audioData = this.findAudioInMessage(messageElement);
      if (audioData) {
        console.log(`[WhatsApp AI] Áudio encontrado via estrutura: ${audioData.src.substring(0, 50)}...`);
        return await this.processAudioBlob(audioData.src);
      }
      
      // Método 3: Buscar todos os blobs de áudio recentes
      const recentAudio = this.findRecentAudioBlob();
      if (recentAudio) {
        console.log(`[WhatsApp AI] Usando áudio recente: ${recentAudio.substring(0, 50)}...`);
        return await this.processAudioBlob(recentAudio);
      }
      
      // Método 4: Tentar extrair áudio sem reproduzir
      const extractedAudio = await this.extractAudioWithoutPlay(messageElement);
      if (extractedAudio) {
        console.log('[WhatsApp AI] Áudio extraído sem reprodução');
        return await this.processAudioBlob(extractedAudio);
      }
      
      throw new Error('Nenhum arquivo de áudio encontrado para transcrever');
      
    } catch (error) {
      console.error('[WhatsApp AI] ERRO DETALHADO:', error);
      throw new Error(`Erro na transcrição: ${error.message}`);
    }
  }

  findAudioInMessage(messageElement) {
    console.log('[WhatsApp AI] Procurando áudio na estrutura da mensagem...');
    
    // Buscar em diferentes estruturas possíveis
    const possibleContainers = [
      messageElement,
      messageElement.querySelector('[data-testid*="audio"]'),
      messageElement.querySelector('[class*="audio"]'),
      messageElement.querySelector('[class*="ptt"]')
    ].filter(Boolean);
    
    for (const container of possibleContainers) {
      const audio = container.querySelector('audio');
      if (audio && audio.src && audio.src.startsWith('blob:')) {
        console.log('[WhatsApp AI] Áudio encontrado em container');
        return { src: audio.src, element: audio };
      }
    }
    
    return null;
  }

  findRecentAudioBlob() {
    console.log('[WhatsApp AI] Buscando blobs de áudio recentes...');
    
    const allAudios = Array.from(document.querySelectorAll('audio[src^="blob:"]'));
    console.log(`[WhatsApp AI] Total de áudios blob encontrados: ${allAudios.length}`);
    
    if (allAudios.length === 0) return null;
    
    // Pegar o mais recente (último na lista)
    const recentAudio = allAudios[allAudios.length - 1];
    return recentAudio.src;
  }

  async extractAudioWithoutPlay(messageElement) {
    console.log('[WhatsApp AI] Tentando extrair áudio sem reprodução...');
    
    // Procurar por elementos que podem conter referência ao áudio
    const audioButtons = messageElement.querySelectorAll('[data-testid*="audio"], [data-icon*="audio"], button[aria-label*="áudio"]');
    
    for (const button of audioButtons) {
      // Verificar se há um elemento audio próximo
      const nearbyAudio = button.parentElement?.querySelector('audio') ||
                         button.closest('[class*="message"]')?.querySelector('audio');
      
      if (nearbyAudio && nearbyAudio.src && nearbyAudio.src.startsWith('blob:')) {
        console.log('[WhatsApp AI] Áudio encontrado próximo ao botão');
        return nearbyAudio.src;
      }
    }
    
    return null;
  }

  async processAudioBlob(blobUrl) {
    console.log(`[WhatsApp AI] === PROCESSANDO BLOB DE ÁUDIO ===`);
    console.log(`[WhatsApp AI] URL: ${blobUrl.substring(0, 50)}...`);

    try {
      // Fazer fetch do blob
      console.log('[WhatsApp AI] Fazendo fetch do blob...');
      const response = await fetch(blobUrl);
      
      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
      }
      
      const audioBlob = await response.blob();
      console.log(`[WhatsApp AI] Blob obtido - Tamanho: ${audioBlob.size} bytes, Tipo: ${audioBlob.type}`);
      
      if (audioBlob.size === 0) {
        throw new Error('Arquivo de áudio vazio');
      }
      
      // Verificar e converter tipo se necessário
      let filename = 'audio.ogg';
      let processedBlob = audioBlob;
      
      if (audioBlob.type.includes('webm')) {
        filename = 'audio.webm';
      } else if (audioBlob.type.includes('mp4')) {
        filename = 'audio.mp4';
      } else if (audioBlob.type.includes('mpeg')) {
        filename = 'audio.mp3';
      }
      
      console.log(`[WhatsApp AI] Arquivo: ${filename}`);
      
      // Preparar FormData para Whisper
      const formData = new FormData();
      formData.append('file', processedBlob, filename);
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');
      formData.append('response_format', 'json');
      
      console.log('[WhatsApp AI] Enviando para OpenAI Whisper...');
      
      // Fazer request para Whisper API
      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`
        },
        body: formData
      });
      
      console.log(`[WhatsApp AI] Resposta Whisper: ${whisperResponse.status} ${whisperResponse.statusText}`);
      
      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        console.error('[WhatsApp AI] Erro da API Whisper:', errorText);
        
        // Tratamento específico de erros
        if (whisperResponse.status === 401) {
          throw new Error('API Key inválida ou sem permissões para Whisper');
        } else if (whisperResponse.status === 429) {
          throw new Error('Limite de rate limit atingido - tente novamente em alguns minutos');
        } else if (whisperResponse.status === 400) {
          throw new Error('Formato de áudio não suportado pelo Whisper');
        } else {
          throw new Error(`Whisper API error: ${whisperResponse.status} - ${errorText}`);
        }
      }
      
      const result = await whisperResponse.json();
      const transcription = result.text?.trim();
      
      if (!transcription || transcription.length === 0) {
        throw new Error('Transcrição vazia retornada pela API');
      }
      
      console.log(`[WhatsApp AI] === TRANSCRIÇÃO CONCLUÍDA ===`);
      console.log(`[WhatsApp AI] Texto: "${transcription}"`);
      console.log(`[WhatsApp AI] Tamanho: ${transcription.length} caracteres`);
      
      return transcription;
      
    } catch (error) {
      console.error('[WhatsApp AI] Erro no processamento do blob:', error);
      throw error;
    }
  }

  async callOpenAI(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.apiKey}`
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim();
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