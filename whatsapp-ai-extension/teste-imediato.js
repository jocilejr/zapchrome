// TESTE IMEDIATO - Cole no console do WhatsApp
console.log('=== TESTE RÁPIDO DA EXTENSÃO ===');

// 1. Verificar se a extensão existe
if (window.whatsappAI) {
    console.log('✅ Extensão encontrada');
    
    // 2. Forçar mostrar o botão
    console.log('🔄 Forçando exibição do botão...');
    window.whatsappAI.showButton();
    
    // 3. Verificar se o botão está visível
    setTimeout(() => {
        const button = document.querySelector('.whatsapp-ai-button');
        if (button) {
            const isVisible = button.classList.contains('visible');
            console.log(`🎯 Botão encontrado. Visível: ${isVisible}`);
            
            if (!isVisible) {
                // Força visibilidade via CSS
                button.style.cssText = `
                    position: fixed !important;
                    bottom: 30px !important;
                    right: 30px !important;
                    width: 60px !important;
                    height: 60px !important;
                    background: linear-gradient(135deg, #25D366, #128C7E) !important;
                    border-radius: 50% !important;
                    cursor: pointer !important;
                    z-index: 999999 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    opacity: 1 !important;
                    transform: scale(1) !important;
                `;
                console.log('🚀 Botão forçado via CSS');
            }
        } else {
            console.log('❌ Botão não encontrado no DOM');
        }
    }, 1000);
    
} else {
    console.log('❌ Extensão não encontrada');
    
    // Criar botão manual como alternativa
    const manualButton = document.createElement('div');
    manualButton.id = 'manual-ai-button';
    manualButton.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, #25D366, #128C7E);
        border-radius: 50%;
        cursor: pointer;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 8px 25px rgba(37, 211, 102, 0.3);
    `;
    manualButton.textContent = 'IA';
    manualButton.onclick = () => {
        alert('Botão manual funcionando! A extensão tem problemas de injeção.');
    };
    
    document.body.appendChild(manualButton);
    console.log('🔧 Botão manual criado como alternativa');
}