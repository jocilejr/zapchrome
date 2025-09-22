# ⚡ TESTE RÁPIDO - Botão não aparece

## 🔧 Para debugar o problema:

### 1. Atualizar a extensão
1. Baixe a nova versão com debug
2. Vá em `chrome://extensions/`
3. Clique no botão **"Recarregar"** na extensão WhatsApp AI Assistant
4. Recarregue o WhatsApp Web (F5)

### 2. Verificar logs de debug
1. No WhatsApp Web, pressione **F12**
2. Vá na aba **Console**
3. Procure por mensagens `[WhatsApp AI]`

**Se você vir estas mensagens, a extensão está funcionando:**
```
[WhatsApp AI] Página já carregada, iniciando extensão...
[WhatsApp AI] Construtor iniciado
[WhatsApp AI] Inicializando...
[WhatsApp AI] Criando botão flutuante...
[WhatsApp AI] Botão criado e adicionado ao DOM
```

### 3. Teste manual (cole no console)
Se as mensagens aparecem mas o botão não, cole isto no console:

```javascript
// Força mostrar o botão  
window.showAIButton();
```

Se o botão aparecer, o problema é só na detecção automática da conversa.

### 4. Se nada aparecer no console
A extensão não está sendo injetada. Possíveis soluções:
- Recarregar a extensão
- Testar em aba privada/incógnito  
- Verificar se não há bloqueadores de anúncio interferindo

### 5. Informações para me enviar
Se ainda não funcionar, me envie:
- Screenshot do console (com as mensagens ou falta delas)
- Screenshot da página `chrome://extensions/` 
- Me diga se o comando `window.showAIButton()` funcionou

---

**🎯 Objetivo**: Identificar se é problema de injeção da extensão ou apenas detecção da conversa.