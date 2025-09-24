# WhatsApp AI Assistant - Extensão Chrome

Uma extensão Chrome que integra IA (OpenAI) ao WhatsApp Web para gerar respostas personalizadas com base nas mensagens de texto mais recentes da conversa.

## 🚀 Funcionalidades

- **Respostas Contextuais**: Analisa automaticamente as últimas mensagens de texto do chat antes de gerar a resposta.
- **Botão Flutuante Inteligente**: O botão só aparece quando uma conversa está ativa e desaparece fora dela.
- **Pergunta Personalizada**: Abra o painel da extensão dentro do WhatsApp Web e peça ajuda para qualquer pergunta com ou sem contexto.
- **Configuração Simples**: Escolha o modelo da OpenAI, defina o estilo das respostas e salve tudo com apenas alguns cliques.
- **Interface em Português**: Todo o fluxo — popup, botões e notificações — foi pensado para o uso em português brasileiro.
- **Tratamento de Erros**: Notificações claras informam quando há problemas de API, conexão ou configuração.

---

## 📦 Instalação

### 1. Download dos arquivos
Baixe todos os arquivos da pasta `whatsapp-ai-extension` para uma pasta local.

### 2. Instalar no Chrome
1. Abra o Chrome e vá para `chrome://extensions/`
2. Ative o **Modo do desenvolvedor** no canto superior direito
3. Clique em **Carregar sem compactação**
4. Selecione a pasta contendo os arquivos da extensão
5. A extensão aparecerá na lista de extensões

### 3. Configuração inicial
1. Clique no ícone da extensão na barra de ferramentas
2. Insira sua **API Key da OpenAI**
3. Escolha o **modelo** desejado (GPT-4o recomendado)
4. Defina o **estilo das respostas**
5. Clique em **Salvar Configurações**

---

## 🔑 Obtendo a API Key da OpenAI

1. Acesse [platform.openai.com](https://platform.openai.com)
2. Faça login ou crie uma conta
3. Vá para **API Keys** no menu lateral
4. Clique em **Create new secret key**
5. Copie a chave gerada (começa com `sk-`)
6. Cole na extensão e salve

---

## 💡 Como usar

1. **Abra o WhatsApp Web** ([web.whatsapp.com](https://web.whatsapp.com))
2. **Selecione uma conversa** — o botão IA aparecerá no canto inferior direito quando um chat estiver ativo
3. **Clique no botão IA** para gerar uma resposta baseada no contexto recente da conversa
4. **Revise a resposta** no modal que será exibido e escolha copiar, usar diretamente no campo de mensagem ou gerar uma nova

### 🎯 Exemplo
```
Contato: Oi! Como foi a reunião com o cliente ontem?
Você: Olá! Foi ótima, eles aprovaram nossa proposta. Hoje à tarde mando os detalhes.
Contato: Perfeito! Precisa de algo da minha parte?
```
Após clicar no botão IA você receberá uma sugestão de resposta alinhada com esse contexto.

---

## ⚙️ Configurações avançadas

### Modelos disponíveis
- **GPT-4o**: Mais avançado e preciso
- **GPT-4o Mini**: Mais rápido e econômico
- **GPT-4 Turbo**: Balanceado
- **GPT-3.5 Turbo**: Mais barato

### Personalização do estilo
Use o campo “Estilo das respostas” no popup para orientar o tom das mensagens, por exemplo:

```
Responda de forma amigável e casual, usando emojis quando fizer sentido.
```

```
Mantenha um tom profissional e direto ao ponto, sem gírias.
```

---

## 🛠️ Estrutura de arquivos

```
whatsapp-ai-extension/
├── manifest.json      # Configurações da extensão
├── background.js      # Service worker que conversa com a OpenAI
├── content.js         # Script principal injetado no WhatsApp Web
├── styles.css         # Estilos do botão flutuante e notificações
├── popup.html         # Interface de configurações
├── popup.js           # Lógica do popup
├── popup.css          # Estilos do popup
├── icons/             # Ícones da extensão
└── README.md          # Este arquivo
```

---

## 🔒 Privacidade e segurança

- **Dados locais**: As configurações ficam armazenadas apenas no navegador.
- **Chamada direta**: A extensão se conecta diretamente à API da OpenAI (HTTPS).
- **Sem servidores próprios**: Nenhuma conversa é enviada para serviços intermediários.

---

## 🐛 Solução de problemas

### O botão IA não aparece
- Verifique se você está com uma conversa aberta
- Recarregue a página do WhatsApp Web
- Confirme se a extensão está ativa em `chrome://extensions`

### Erro na API
- Confirme se sua API Key está correta e tem créditos disponíveis
- Teste a conexão pelo botão **Testar API** no popup

### Resposta não é inserida automaticamente
- Clique no campo de mensagem antes de usar a resposta
- Se necessário, utilize o botão **Copiar** e cole manualmente

---

## 📝 Changelog

### v5.0 - Foco em respostas de texto
- Removido o suporte a transcrição de áudio
- Simplificação do popup e das permissões da extensão
- Novo conteúdo da resposta baseado somente nas mensagens de texto recentes
- Limpeza dos utilitários e arquivos de depuração relacionados a áudio

### v1.0.0
- Lançamento inicial com integração ao ChatGPT
- Botão flutuante responsivo
- Interface de configurações completa

---

**🎉 Desenvolvido com ❤️ para melhorar sua experiência no WhatsApp Web**
