// Debug Avançado de Transcrição - WhatsApp AI Extension
// Cole este código no Console do Chrome para diagnosticar problemas

console.log('🔧 DEBUG AVANÇADO DE TRANSCRIÇÃO');
console.log('=================================');

async function debugTranscricaoCompleto() {
  console.log('\n🔍 INICIANDO DIAGNÓSTICO COMPLETO...');
  
  // 1. Verificar extensão
  if (!window.whatsappAI) {
    console.error('❌ Extensão não carregada');
    return;
  }
  console.log('✅ Extensão carregada');
  
  // 2. Verificar API Key
  const apiKey = window.whatsappAI.settings.apiKey;
  if (!apiKey) {
    console.error('❌ API Key não configurada');
    return;
  }
  console.log('✅ API Key configurada:', apiKey.substring(0, 7) + '...');
  
  // 3. Testar API Key com OpenAI
  console.log('\n🔑 TESTANDO API KEY...');
  try {
    const testResponse = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    if (testResponse.ok) {
      console.log('✅ API Key válida');
    } else {
      console.error('❌ API Key inválida:', testResponse.status);
      return;
    }
  } catch (error) {
    console.error('❌ Erro ao testar API Key:', error);
    return;
  }
  
  // 4. Mapear estrutura do DOM
  console.log('\n🗺️ MAPEANDO ESTRUTURA DO DOM...');
  
  const messageContainers = document.querySelectorAll('[data-testid="msg-container"]');
  console.log(`📦 Containers de mensagem: ${messageContainers.length}`);
  
  const allAudios = document.querySelectorAll('audio');
  console.log(`🎵 Elementos <audio>: ${allAudios.length}`);
  
  const blobAudios = Array.from(allAudios).filter(a => a.src && a.src.startsWith('blob:'));
  console.log(`🔗 Áudios com blob URL: ${blobAudios.length}`);
  
  // 5. Analisar cada áudio blob
  if (blobAudios.length > 0) {
    console.log('\n📋 ANÁLISE DE ÁUDIOS BLOB:');
    
    for (let i = 0; i < blobAudios.length; i++) {
      const audio = blobAudios[i];
      console.log(`\n🎵 Áudio ${i + 1}:`);
      console.log(`   URL: ${audio.src}`);
      console.log(`   Duração: ${audio.duration || 'não carregado'}`);
      console.log(`   Estado: ${audio.readyState}`);
      console.log(`   Tamanho: ${audio.networkState}`);
      
      // Testar fetch do blob
      try {
        const response = await fetch(audio.src);
        const blob = await response.blob();
        console.log(`   ✅ Fetch OK - ${blob.size} bytes, tipo: ${blob.type}`);
        
        // Testar com Whisper (apenas o primeiro áudio para não gastar créditos)
        if (i === 0) {
          console.log('\n🎤 TESTANDO WHISPER API...');
          await testarWhisperComBlob(blob, apiKey);
        }
        
      } catch (error) {
        console.log(`   ❌ Fetch ERRO: ${error.message}`);
      }
    }
  }
  
  // 6. Buscar mensagens de áudio
  console.log('\n📨 BUSCANDO MENSAGENS DE ÁUDIO...');
  
  const audioSelectors = [
    '[data-testid="audio-play-button"]',
    '[data-testid="ptt-play-button"]',
    '[data-icon="audio-play"]',
    '[aria-label*="áudio"]',
    '[aria-label*="Audio"]'
  ];
  
  let audioMessages = [];
  
  audioSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`${selector}: ${elements.length} elementos`);
    
    elements.forEach(el => {
      const container = el.closest('[data-testid="msg-container"]');
      if (container && !audioMessages.includes(container)) {
        audioMessages.push(container);
      }
    });
  });
  
  console.log(`📨 Total de mensagens de áudio: ${audioMessages.length}`);
  
  // 7. Analisar última mensagem de áudio
  if (audioMessages.length > 0) {
    console.log('\n🔍 ANALISANDO ÚLTIMA MENSAGEM DE ÁUDIO...');
    const lastAudioMsg = audioMessages[audioMessages.length - 1];
    
    // Procurar áudio na mensagem
    const audioInMsg = lastAudioMsg.querySelector('audio');
    console.log(`Áudio na mensagem: ${audioInMsg ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
    
    if (audioInMsg) {
      console.log(`URL: ${audioInMsg.src || 'SEM SRC'}`);
      console.log(`Tipo: ${audioInMsg.type || 'SEM TIPO'}`);
    }

    if (
      window.whatsappAI &&
      typeof window.whatsappAI.getMessageIdFromElement === 'function'
    ) {
      const messageId = window.whatsappAI.getMessageIdFromElement(lastAudioMsg);
      if (messageId) {
        console.log(`🆔 ID da mensagem: ${messageId}`);

        if (typeof window.whatsappAI.getWhatsAppMessageById === 'function') {
          console.log('🧪 Solicitando GET_AUDIO_BLOB via bridge do Store...');
          try {
            const helperResponse = await window.whatsappAI.getWhatsAppMessageById(messageId);
            const normalizedBlob =
              typeof window.whatsappAI.normalizeHelperBlob === 'function'
                ? window.whatsappAI.normalizeHelperBlob(
                    helperResponse?.blob,
                    helperResponse?.metadata?.mimeType
                  )
                : helperResponse?.blob;

            if (normalizedBlob instanceof Blob) {
              console.log(
                `✅ GET_AUDIO_BLOB OK - ${normalizedBlob.size} bytes (${normalizedBlob.type ||
                  helperResponse?.metadata?.mimeType ||
                  'tipo desconhecido'})`
              );
            } else if (normalizedBlob) {
              console.log('⚠️ GET_AUDIO_BLOB retornou valor não-Blob, tentando inspecionar...');
              console.log(normalizedBlob);
            } else {
              console.error('❌ GET_AUDIO_BLOB não retornou blob válido');
            }
          } catch (error) {
            console.error('❌ Erro ao obter blob via bridge:', error);
          }
        } else {
          console.warn('⚠️ Método getWhatsAppMessageById não disponível na instância whatsappAI');
        }
      } else {
        console.warn('⚠️ Não foi possível determinar o ID da mensagem de áudio');
      }
    } else {
      console.warn('⚠️ Instância whatsappAI não expõe método getMessageIdFromElement');
    }

    // Tentar transcrição real
    console.log('\n🎯 TESTANDO TRANSCRIÇÃO REAL...');
    try {
      const transcricao = await window.whatsappAI.transcribeAudio(lastAudioMsg);
      console.log(`✅ SUCESSO: "${transcricao}"`);
    } catch (error) {
      if (error?.message?.includes('Nenhum arquivo de áudio encontrado')) {
        console.error('❌ ERRO: Nenhum arquivo de áudio encontrado durante a transcrição');
      } else {
        console.error(`❌ ERRO: ${error.message}`);
      }
      console.error('Stack trace:', error);
    }
  }
}

async function testarWhisperComBlob(blob, apiKey) {
  try {
    const formData = new FormData();
    formData.append('file', blob, 'test-audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Whisper OK: "${result.text}"`);
    } else {
      const error = await response.text();
      console.error(`❌ Whisper ERRO (${response.status}): ${error}`);
    }
  } catch (error) {
    console.error('❌ Erro na requisição Whisper:', error);
  }
}

// Função simplificada para testes rápidos
function testeRapido() {
  console.log('\n⚡ TESTE RÁPIDO');
  console.log('===============');
  
  const audios = document.querySelectorAll('audio[src^="blob:"]');
  console.log(`🎵 Áudios blob: ${audios.length}`);
  
  if (audios.length > 0) {
    const ultimo = audios[audios.length - 1];
    console.log(`🔗 Último áudio: ${ultimo.src.substring(0, 50)}...`);
    
    // Testar fetch
    fetch(ultimo.src)
      .then(r => r.blob())
      .then(b => console.log(`✅ Blob: ${b.size} bytes, ${b.type}`))
      .catch(e => console.error(`❌ Erro: ${e.message}`));
  }
  
  const audioButtons = document.querySelectorAll('[data-testid*="audio"]');
  console.log(`🔘 Botões de áudio: ${audioButtons.length}`);
}

// Expor funções
window.debugTranscricaoCompleto = debugTranscricaoCompleto;
window.testeRapido = testeRapido;

console.log('\n📋 COMANDOS DISPONÍVEIS:');
console.log('- debugTranscricaoCompleto() - Diagnóstico completo');
console.log('- testeRapido() - Teste rápido de estruturas');
console.log('\n💡 Execute o comando desejado no console');