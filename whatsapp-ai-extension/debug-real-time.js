// DEBUG EM TEMPO REAL - Cole no console para testar

console.log('=== DEBUG CAMPOS DE INPUT ===');

// 1. Listar TODOS os campos contenteditable
const allInputs = document.querySelectorAll('[contenteditable="true"]');
console.log(`Total de campos contenteditable: ${allInputs.length}`);

allInputs.forEach((input, index) => {
    const placeholder = input.getAttribute('placeholder') || 'sem placeholder';
    const dataTestId = input.getAttribute('data-testid') || 'sem data-testid';
    const dataTab = input.getAttribute('data-tab') || 'sem data-tab';
    const isVisible = input.offsetParent !== null;
    const isSearch = input.closest('[data-testid="chat-list-search"]') || 
                    input.getAttribute('placeholder')?.toLowerCase().includes('pesquisar');
    
    console.log(`Campo ${index + 1}:`);
    console.log(`  - Placeholder: "${placeholder}"`);
    console.log(`  - data-testid: "${dataTestId}"`);
    console.log(`  - data-tab: "${dataTab}"`);
    console.log(`  - Visível: ${isVisible}`);
    console.log(`  - É busca: ${!!isSearch}`);
    console.log(`  - Elemento:`, input);
    console.log('---');
});

// 2. Testar inserção em cada campo
console.log('\n=== TESTE DE INSERÇÃO ===');
const testText = 'TESTE DE DEBUG';

allInputs.forEach((input, index) => {
    if (input.offsetParent !== null) { // Só testa se visível
        console.log(`Testando inserção no campo ${index + 1}...`);
        
        try {
            input.focus();
            input.textContent = testText + ` (Campo ${index + 1})`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            
            console.log(`✅ Inserção no campo ${index + 1} concluída`);
            
            // Aguarda um pouco e limpa
            setTimeout(() => {
                input.textContent = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }, 2000);
            
        } catch (error) {
            console.log(`❌ Erro no campo ${index + 1}:`, error);
        }
    }
});

// 3. Debug específico para áudios
console.log('\n=== DEBUG ÁUDIOS ===');

const audioButtons = document.querySelectorAll('[data-testid="audio-play-button"], [data-testid="ptt-play-button"]');
console.log(`Botões de áudio encontrados: ${audioButtons.length}`);

audioButtons.forEach((button, index) => {
    console.log(`Áudio ${index + 1}:`);
    console.log(`  - Elemento:`, button);
    console.log(`  - Container:`, button.closest('div'));
    
    // Procura por elementos audio próximos
    const container = button.closest('div');
    const audios = container?.querySelectorAll('audio') || [];
    console.log(`  - Elementos audio no container: ${audios.length}`);
    
    audios.forEach((audio, audioIndex) => {
        console.log(`    Audio ${audioIndex + 1}: ${audio.src || 'sem src'}`);
    });
});

// 4. Função para testar transcrição manual
window.testTranscription = function() {
    console.log('Iniciando teste de transcrição...');
    
    const audioButtons = document.querySelectorAll('[data-testid="audio-play-button"], [data-testid="ptt-play-button"]');
    if (audioButtons.length === 0) {
        console.log('Nenhum áudio encontrado para testar');
        return;
    }
    
    const firstAudio = audioButtons[0];
    console.log('Testando transcrição no primeiro áudio encontrado:', firstAudio);
    
    if (window.whatsappAI && window.whatsappAI.transcribeAudio) {
        window.whatsappAI.transcribeAudio(firstAudio).then(result => {
            console.log('Resultado da transcrição:', result);
        }).catch(error => {
            console.error('Erro na transcrição:', error);
        });
    } else {
        console.log('Extensão ou método de transcrição não encontrado');
    }
};

console.log('\n=== COMANDOS DISPONÍVEIS ===');
console.log('testTranscription() - Testa transcrição do primeiro áudio');
console.log('window.whatsappAI.showButton() - Força mostrar botão');
console.log('window.whatsappAI.generateResponse() - Força geração de resposta');