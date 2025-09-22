// COMANDOS PARA TESTAR NO CONSOLE DO WHATSAPP WEB
// Abra o DevTools (F12) no WhatsApp Web e execute estes comandos um por um

// 1. Verificar se a extensão está carregada
console.log('Extensão carregada:', window.WhatsAppAIAssistant || 'Não encontrada');

// 2. Verificar seletores do WhatsApp
console.log('=== VERIFICAÇÃO DE SELETORES ===');

// Cabeçalho da conversa
const headers = [
  '[data-testid="conversation-header"]',
  '[data-testid="chat-header"]', 
  'header[class*="chat"]',
  '[data-testid="header"]'
];

headers.forEach(selector => {
  const found = document.querySelector(selector);
  console.log(`${selector}: ${found ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
});

// Input de mensagem
const inputs = [
  '[data-testid="compose-box-input"]',
  '[contenteditable="true"][data-testid*="compose"]',
  '[data-tab="10"]',
  'div[contenteditable="true"][data-tab]'
];

inputs.forEach(selector => {
  const found = document.querySelector(selector);
  console.log(`${selector}: ${found ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
});

// 3. Forçar criação do botão (TESTE MANUAL)
if (!document.querySelector('.whatsapp-ai-button')) {
  const button = document.createElement('div');
  button.className = 'whatsapp-ai-button visible';
  button.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #25D366, #128C7E);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 8px 25px rgba(37, 211, 102, 0.3);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 14px;
  `;
  button.textContent = 'IA';
  button.onclick = () => alert('Botão de teste funcionando!');
  document.body.appendChild(button);
  console.log('Botão de teste criado!');
}

// 4. Verificar mensagens
const messageSelectors = [
  '[data-testid="msg-container"]',
  '.message-in, .message-out',
  '[class*="message"]'
];

messageSelectors.forEach(selector => {
  const found = document.querySelectorAll(selector);
  console.log(`${selector}: ${found.length} elementos encontrados`);
});

// 5. Listar todas as classes CSS disponíveis (para debug)
console.log('=== CLASSES CSS NO BODY ===');
const allElements = document.querySelectorAll('*');
const classes = new Set();
allElements.forEach(el => {
  if (el.className && typeof el.className === 'string') {
    el.className.split(' ').forEach(cls => {
      if (cls.trim()) classes.add(cls);
    });
  }
});
console.log('Total de classes:', classes.size);
console.log('Classes relacionadas a chat/message:', 
  Array.from(classes).filter(cls => 
    cls.includes('chat') || 
    cls.includes('message') || 
    cls.includes('compose') || 
    cls.includes('input')
  )
);