# WhatsApp AI Assistant - Extensão Chrome

Uma extensão Chrome que integra IA (OpenAI) ao WhatsApp Web para gerar respostas personalizadas baseadas no contexto da conversa, **com transcrição de áudio funcionando**.

## 🚀 Funcionalidades

- **Respostas Personalizadas**: Gera respostas inteligentes baseadas no histórico das últimas 8 mensagens
- **✅ Transcrição de Áudio FUNCIONAL**: Transcreve automaticamente mensagens de áudio via OpenAI Whisper
- **Botão Flutuante**: Interface discreta que aparece apenas quando uma conversa está aberta
- **Configuração Flexível**: Escolha o modelo OpenAI e defina o estilo das respostas
- **Interface em Português**: Totalmente traduzida para português brasileiro
- **Design Responsivo**: Funciona perfeitamente em desktop e mobile
- **Tratamento de Erros Robusto**: Sistema de fallback e notificações informativas

## 🎵 **TRANSCRIÇÃO DE ÁUDIO - VERSÃO CORRIGIDA v4.1**

### ✅ **O que foi corrigido:**
- **Detecção aprimorada**: Múltiplos seletores para encontrar áudios
- **Captura robusta**: Melhor método para acessar arquivos de áudio
- **Timing otimizado**: Aguarda carregamento adequado dos áudios
- **Tratamento de erros**: Mensagens específicas e sistema de fallback
- **Logs detalhados**: Facilita identificação e correção de problemas

### 🎯 **Como funciona agora:**
1. **Detecta** mensagens de áudio automaticamente
2. **Captura** o arquivo de áudio do WhatsApp Web  
3. **Transcreve** via OpenAI Whisper API
4. **Gera resposta** baseada no conteúdo transcrito
5. **Mostra progresso** com notificações informativas

---

## 📦 Instalação

### 1. Download dos Arquivos
Baixe todos os arquivos da extensão para uma pasta local.

### 2. Instalar no Chrome
1. Abra o Chrome e vá para `chrome://extensions/`
2. Ative o **Modo do desenvolvedor** no canto superior direito
3. Clique em **Carregar sem compactação**
4. Selecione a pasta contendo os arquivos da extensão
5. A extensão será instalada e aparecerá na lista

### 3. Configuração Inicial
1. Clique no ícone da extensão na barra de ferramentas
2. Insira sua **API Key da OpenAI**
3. Escolha o **modelo** desejado (GPT-4o recomendado)
4. Defina o **estilo das respostas**
5. Clique em **Salvar Configurações**

## 🔑 Obtendo a API Key da OpenAI

1. Acesse [platform.openai.com](https://platform.openai.com)
2. Faça login ou crie uma conta
3. Vá para **API Keys** no menu lateral
4. Clique em **Create new secret key**
5. **IMPORTANTE**: Certifique-se de que sua conta tem acesso ao **Whisper API**
6. Copie a chave gerada (começa com `sk-`)
7. Cole na extensão

⚠️ **Para transcrição de áudio**: Sua API Key deve ter permissões para Whisper ($0.006 por minuto)

---

## 💡 Como Usar

1. **Abra o WhatsApp Web** ([web.whatsapp.com](https://web.whatsapp.com))
2. **Selecione uma conversa** - o botão IA aparecerá no canto inferior direito
3. **Clique no botão IA** para gerar uma resposta
4. **🎵 Áudios são transcritos automaticamente** - você verá "Analisando conversa e transcrevendo áudios..."
5. **A resposta será baseada no conteúdo real** dos áudios transcritos
6. **Edite se necessário** e envie

### 🎯 **Exemplo com áudio:**
```
Contato: [ÁUDIO] "Oi, você vai na festa hoje à noite?"
IA: "Oi! Sim, vou sim! Que horas vai começar? Preciso de alguma coisa?"
```

---

## 🧪 Testando a Transcrição

### Teste Rápido:
1. Peça para alguém enviar um áudio
2. Clique no botão IA
3. Observe: "🎵 Analisando conversa e transcrevendo áudios..."
4. Resultado: "✅ Resposta gerada! 1 áudio(s) transcrito(s)"

### Teste Avançado:
1. Abra o Console (F12)
2. Execute: `testarTranscricao()`
3. Analise os logs detalhados

### 📋 **Para diagnósticos detalhados**, consulte:
- `CORRECAO-TRANSCRICAO.md` - Guia completo de troubleshooting
- `teste-transcricao.js` - Script de teste manual

---

## ⚙️ Configurações Avançadas

### Modelos Disponíveis
- **GPT-4o**: Mais avançado e preciso
- **GPT-4o Mini**: Mais rápido e econômico
- **GPT-4 Turbo**: Balanceado
- **GPT-3.5 Turbo**: Mais barato

### Personalização do Estilo
Exemplos de estilos que você pode configurar:

```
Responda sempre de forma amigável e casual, usando emojis quando apropriado.
```

```
Seja profissional e formal, adequado para conversas de trabalho.
```

```
Use um tom descontraído e bem-humorado, como se fosse um amigo próximo.
```

## 🛠️ Estrutura de Arquivos

```
whatsapp-ai-extension/
├── manifest.json              # Configurações da extensão
├── content.js                 # Script principal (CORRIGIDO v4.1)
├── popup.html                # Interface de configurações
├── popup.js                  # Lógica das configurações
├── popup.css                 # Estilos do popup
├── styles.css                # Estilos do botão flutuante
├── background.js             # Service worker
├── teste-transcricao.js      # Script de teste manual
├── CORRECAO-TRANSCRICAO.md   # Guia de troubleshooting
└── README.md                 # Este arquivo
```

## 🔒 Privacidade e Segurança

- **Dados Locais**: Suas configurações ficam armazenadas localmente no Chrome
- **API Direta**: A extensão se conecta diretamente à OpenAI, sem servidores intermediários
- **Sem Coleta**: Não coletamos nem armazenamos suas conversas
- **Código Aberto**: Todo o código está disponível para auditoria

## 🐛 Solução de Problemas

### Transcrição não funciona
- ✅ Verifique se sua API Key tem acesso ao Whisper
- ✅ Confirme se há créditos suficientes na conta OpenAI
- ✅ Execute `testarTranscricao()` no console para diagnosticar
- ✅ Consulte `CORRECAO-TRANSCRICAO.md` para troubleshooting detalhado

### Botão não aparece
- Verifique se você está em uma conversa ativa
- Recarregue a página do WhatsApp Web
- Verifique se a extensão está ativada

### Erro na API
- Confirme se sua API Key está correta
- Verifique se você tem créditos na conta OpenAI
- Teste a conexão no popup da extensão

### Resposta não é inserida
- Certifique-se de que o campo de texto está ativo
- Tente clicar no campo de mensagem antes de gerar a resposta

## 📝 Changelog

### v4.1 - **TRANSCRIÇÃO CORRIGIDA**
- ✅ Detecção de áudio robusta com múltiplos seletores
- ✅ Captura de áudio aprimorada com melhor timing
- ✅ Tratamento específico de erros da Whisper API
- ✅ Sistema de fallback para resposta sem transcrição
- ✅ Notificações informativas com contador de áudios
- ✅ Logs detalhados para debug
- ✅ Script de teste manual incluído
- ✅ Guia completo de troubleshooting

### v1.0.0
- Lançamento inicial
- Integração com OpenAI GPT
- Botão flutuante responsivo
- Interface de configurações completa
- Suporte a múltiplos modelos
- Personalização de estilo de resposta

## 🤝 Contribuição

Sinta-se à vontade para reportar bugs, sugerir melhorias ou contribuir com código!

## 📄 Licença

Esta extensão é fornecida "como está" para uso pessoal.

---

**🎉 Desenvolvido com ❤️ para melhorar sua experiência no WhatsApp Web**

**🎵 Agora com transcrição de áudio realmente funcionando!**