// TESTE PARA VERIFICAR O QUE ESTÁ SENDO COPIADO
// Cole no console após gerar uma resposta

// 1. Verificar o conteúdo do modal
const modal = document.querySelector('.whatsapp-ai-modal');
if (modal) {
    const responseText = modal.querySelector('.ai-response-text');
    if (responseText) {
        console.log('=== CONTEÚDO DO MODAL ===');
        console.log('Texto no modal:', responseText.textContent);
        console.log('innerHTML:', responseText.innerHTML);
        console.log('=========================');
    }
}

// 2. Simular clique no botão copiar e verificar o que foi copiado
setTimeout(async () => {
    try {
        const clipboardText = await navigator.clipboard.readText();
        console.log('=== CONTEÚDO DA ÁREA DE TRANSFERÊNCIA ===');
        console.log('Texto copiado:', clipboardText);
        console.log('==========================================');
    } catch (error) {
        console.log('Erro ao ler área de transferência:', error);
        console.log('Teste manual: Cole (Ctrl+V) em um editor de texto para ver o conteúdo');
    }
}, 1000);