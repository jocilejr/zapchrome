// Teste Manual de Transcrição - WhatsApp AI Extension
// Cole este código no Console do Chrome (F12) quando estiver no WhatsApp Web

console.log('🎵 TESTE DE TRANSCRIÇÃO - WhatsApp AI Extension');
console.log('Versão: v4.1 - Transcrição Corrigida');
console.log('===============================================');

// Função para testar transcrição manual
async function testarTranscricao() {
  console.log('\n🔍 INICIANDO TESTE DE TRANSCRIÇÃO...');
  
  // Verificar se a extensão está carregada
  if (!window.whatsappAI) {
    console.error('❌ Extensão não encontrada! Verifique se está instalada e ativada.');
    return;
  }
  
  console.log('✅ Extensão encontrada');
  
  // Verificar API Key
  const assistant = window.whatsappAI;
  const hasApiKey = typeof assistant.ensureApiKeyConfigured === 'function'
    ? await assistant.ensureApiKeyConfigured()
    : !!assistant.apiKeyConfigured;

  if (!hasApiKey) {
    console.error('❌ API Key não configurada! Configure primeiro no popup da extensão.');
    return;
  }

  console.log('✅ API Key configurada');
  
  // Buscar mensagens de áudio
  console.log('\n🔍 Buscando mensagens de áudio...');
  
  const audioSelectors = [
    '[data-testid="audio-play-button"]',
    '[data-testid="ptt-play-button"]',
    '[data-icon="audio-play"]',
    '.audio-play-button'
  ];
  
  let audioMessages = [];
  
  for (const selector of audioSelectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      const messageContainer = el.closest('[data-testid="msg-container"]') || 
                              el.closest('.message-in') || 
                              el.closest('.message-out');
      if (messageContainer) {
        audioMessages.push(messageContainer);
      }
    });
  }
  
  if (audioMessages.length === 0) {
    console.warn('⚠️ Nenhuma mensagem de áudio encontrada na conversa atual.');
    console.log('💡 Dica: Peça para alguém enviar um áudio ou mude para uma conversa que tenha áudios.');
    return;
  }
  
  console.log(`✅ ${audioMessages.length} mensagem(ns) de áudio encontrada(s)`);
  
  // Testar transcrição da última mensagem de áudio
  const lastAudioMessage = audioMessages[audioMessages.length - 1];
  console.log('\n🎵 Testando transcrição da última mensagem de áudio...');
  
  try {
    const transcricao = await window.whatsappAI.transcribeAudio(lastAudioMessage);
    console.log('✅ TRANSCRIÇÃO CONCLUÍDA:');
    console.log(`📝 Texto: "${transcricao}"`);
    console.log(`📏 Tamanho: ${transcricao.length} caracteres`);
    
    // Testar geração de resposta
    console.log('\n🤖 Testando geração de resposta baseada na transcrição...');
    
    const prompt = `Responda de forma amigável e contextual.
    
Uma pessoa disse em áudio: "${transcricao}"

Responda naturalmente em português:`;
    
    const resposta = await window.whatsappAI.callOpenAI(prompt);
    
    if (resposta) {
      console.log('✅ RESPOSTA GERADA:');
      console.log(`💬 Resposta: "${resposta}"`);
      console.log('\n🎉 TESTE COMPLETO - TUDO FUNCIONANDO!');
    } else {
      console.error('❌ Erro ao gerar resposta');
    }
    
  } catch (error) {
    console.error('❌ ERRO NA TRANSCRIÇÃO:', error.message);
    console.log('\n🔧 DETALHES DO ERRO:');
    console.error(error);
    
    // Diagnósticos adicionais
    console.log('\n🔍 DIAGNÓSTICOS:');
    
    // Verificar áudios na página
    const audios = document.querySelectorAll('audio');
    console.log(`📻 Elementos <audio> na página: ${audios.length}`);
    
    const blobAudios = Array.from(audios).filter(a => a.src && a.src.startsWith('blob:'));
    console.log(`🔗 Áudios com blob URL: ${blobAudios.length}`);
    
    if (blobAudios.length > 0) {
      console.log('📋 URLs dos áudios:');
      blobAudios.forEach((audio, i) => {
        console.log(`  ${i + 1}. ${audio.src}`);
        console.log(`     Duração: ${audio.duration || 'não carregado'}`);
        console.log(`     Estado: ${audio.readyState}`);
      });
    }
    
    // Sugestões de correção
    console.log('\n💡 POSSÍVEIS SOLUÇÕES:');
    console.log('1. Verifique se a API Key tem permissões para Whisper');
    console.log('2. Tente clicar no play do áudio antes de rodar o teste');
    console.log('3. Verifique sua conexão com a internet');
    console.log('4. Confirme se você tem créditos na conta OpenAI');
  }
}

// Função para testar detecção de áudios
function testarDeteccaoAudio() {
  console.log('\n🔍 TESTE DE DETECÇÃO DE ÁUDIO');
  console.log('===============================');
  
  const selectors = [
    '[data-testid="audio-play-button"]',
    '[data-testid="ptt-play-button"]',
    '[data-icon="audio-play"]',
    '.audio-play-button',
    'button[aria-label*="Play"]',
    'button[aria-label*="Reproduzir"]'
  ];
  
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`${selector}: ${elements.length} elemento(s)`);
  });
  
  // Verificar áudios HTML5
  const audios = document.querySelectorAll('audio');
  console.log(`\n📻 Elementos <audio>: ${audios.length}`);
  
  const blobAudios = Array.from(audios).filter(a => a.src && a.src.startsWith('blob:'));
  console.log(`🔗 Áudios com blob URL: ${blobAudios.length}`);
}

// Expor funções globalmente para teste manual
window.testarTranscricao = testarTranscricao;
window.testarDeteccaoAudio = testarDeteccaoAudio;

console.log('\n📋 COMANDOS DISPONÍVEIS:');
console.log('- testarTranscricao() - Testa a transcrição completa');
console.log('- testarDeteccaoAudio() - Verifica detecção de áudios');
console.log('\n💡 Para usar: digite o comando no console e pressione Enter');