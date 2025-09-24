// Popup Script para WhatsApp AI Assistant
class PopupManager {
  constructor() {
    this.elements = {
      apiKey: document.getElementById('apiKey'),
      model: document.getElementById('model'),
      responseStyle: document.getElementById('responseStyle'),
      saveButton: document.getElementById('saveButton'),
      testButton: document.getElementById('testButton'),
      toggleApiKey: document.getElementById('toggleApiKey'),
      status: document.getElementById('status'),
      tabButtons: document.querySelectorAll('[data-tab-button]'),
      tabContents: document.querySelectorAll('.tab-content')
    };

    this.activeTab = 'general';
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupTabs();
    this.attachEventListeners();
    this.setDefaultValues();
  }

  async loadSettings() {
    try {
      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(['model', 'responseStyle']),
        chrome.storage.local.get('OPENAI_KEY')
      ]);

      if (localSettings.OPENAI_KEY) {
        this.elements.apiKey.value = localSettings.OPENAI_KEY;
      }
      if (syncSettings.model) {
        this.elements.model.value = syncSettings.model;
      }
      if (syncSettings.responseStyle) {
        this.elements.responseStyle.value = syncSettings.responseStyle;
      }
    } catch (error) {
      this.showStatus('Erro ao carregar configurações', 'error');
    }
  }

  setDefaultValues() {
    if (!this.elements.responseStyle.value) {
      this.elements.responseStyle.value = 'Responda de forma natural e contextual, mantendo o tom da conversa. Use português brasileiro e seja amigável.';
    }
  }

  attachEventListeners() {
    this.elements.saveButton.addEventListener('click', () => this.saveSettings());
    this.elements.testButton.addEventListener('click', () => this.testAPI());
    if (this.elements.toggleApiKey) {
      this.elements.toggleApiKey.addEventListener('click', () => this.toggleApiKeyVisibility());
    }

    // Auto-save quando os campos mudam
    this.elements.apiKey.addEventListener('input', () => this.debounceAutoSave());
    this.elements.model.addEventListener('change', () => this.autoSave());
    this.elements.responseStyle.addEventListener('input', () => this.debounceAutoSave());
  }

  debounceAutoSave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => this.autoSave(), 1000);
  }

  async autoSave() {
    try {
      const apiKey = this.elements.apiKey.value.trim();
      await Promise.all([
        chrome.storage.local.set({ OPENAI_KEY: apiKey }),
        chrome.storage.sync.set({
          model: this.elements.model.value,
          responseStyle: this.elements.responseStyle.value.trim()
        })
      ]);
      this.notifyContentScripts();
    } catch (error) {
      console.error('Erro no auto-save:', error);
    }
  }

  async saveSettings() {
    const apiKey = this.elements.apiKey.value.trim();
    const model = this.elements.model.value;
    const responseStyle = this.elements.responseStyle.value.trim();

    if (!apiKey) {
      this.showStatus('Informe a API Key da OpenAI', 'error');
      return;
    }

    if (!responseStyle) {
      this.showStatus('Por favor, defina o estilo das respostas', 'error');
      return;
    }

    try {
      this.elements.saveButton.classList.add('loading');

      await Promise.all([
        chrome.storage.local.set({ OPENAI_KEY: apiKey }),
        chrome.storage.sync.set({
          model,
          responseStyle
        })
      ]);

      this.showStatus('Configurações salvas com sucesso!', 'success');

      // Notifica os content scripts sobre as mudanças
      this.notifyContentScripts();
      
    } catch (error) {
      this.showStatus('Erro ao salvar configurações', 'error');
    } finally {
      this.elements.saveButton.classList.remove('loading');
    }
  }

  async testAPI() {
    const apiKey = this.elements.apiKey.value.trim();
    const model = this.elements.model.value;

    if (!apiKey) {
      this.showStatus('Insira sua API Key primeiro', 'error');
      return;
    }

    this.elements.testButton.classList.add('loading');
    this.showStatus('Testando conexão com OpenAI...', 'info');

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: 'Responda apenas "Teste OK" em português.'
            }
          ],
          max_tokens: 10
        })
      });

      if (response.ok) {
        const data = await response.json();
        this.showStatus('✅ API funcionando corretamente!', 'success');
      } else {
        const errorData = await response.json();
        this.showStatus(`❌ Erro na API: ${errorData.error?.message || 'Erro desconhecido'}`, 'error');
      }

    } catch (error) {
      this.showStatus('❌ Erro de conexão com a API', 'error');
    } finally {
      this.elements.testButton.classList.remove('loading');
    }
  }

  toggleApiKeyVisibility() {
    const isPassword = this.elements.apiKey.type === 'password';
    this.elements.apiKey.type = isPassword ? 'text' : 'password';
    
    const icon = this.elements.toggleApiKey.querySelector('svg');
    if (isPassword) {
      // Ícone de "esconder"
      icon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="2"/>
        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2"/>
      `;
    } else {
      // Ícone de "mostrar"
      icon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
      `;
    }
  }

  async notifyContentScripts() {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' });
      });
    } catch (error) {
      console.error('Erro ao notificar content scripts:', error);
    }
  }

  showStatus(message, type = 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status ${type}`;

    if (type === 'success' || type === 'error' || type === 'warning') {
      setTimeout(() => {
        this.elements.status.textContent = '';
        this.elements.status.className = 'status';
      }, 3000);
    }
  }

  setupTabs() {
    const buttons = this.elements.tabButtons;
    if (!buttons || buttons.length === 0) {
      return;
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;
        this.switchTab(targetTab);
      });
    });
  }

  switchTab(tab) {
    if (!tab || tab === this.activeTab) {
      return;
    }

    this.activeTab = tab;

    if (this.elements.tabButtons) {
      this.elements.tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
      });
    }

    if (this.elements.tabContents) {
      this.elements.tabContents.forEach((content) => {
        content.classList.toggle('active', content.dataset.tab === tab);
      });
    }
  }
}

// Inicializa quando o popup carrega
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});