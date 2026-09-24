import { RainbotAttr } from '../semconv';

describe('RainbotAttr', () => {
  it('namespaces every attribute under rainbot.', () => {
    for (const value of Object.values(RainbotAttr)) {
      expect(value).toMatch(/^rainbot\./);
    }
  });

  it('has no duplicate attribute names', () => {
    const values = Object.values(RainbotAttr);
    expect(new Set(values).size).toBe(values.length);
  });

  it('exposes the attributes the spec names', () => {
    expect(RainbotAttr.guildId).toBe('rainbot.guild_id');
    expect(RainbotAttr.worker).toBe('rainbot.worker');
    expect(RainbotAttr.extractionPath).toBe('rainbot.extraction_path');
  });

  // Pins every key and value at once, not just the three sampled above — a
  // typo in any of the other keys would otherwise slip through untested.
  it('pins the full attribute set', () => {
    expect(RainbotAttr).toEqual({
      guildId: 'rainbot.guild_id',
      userId: 'rainbot.user_id',
      commandName: 'rainbot.command_name',
      worker: 'rainbot.worker',
      sound: 'rainbot.sound',
      trackUrl: 'rainbot.track_url',
      trackSource: 'rainbot.track_source',
      voiceChannel: 'rainbot.voice_channel',
      queueLength: 'rainbot.queue_length',
      extractionPath: 'rainbot.extraction_path',
      proxyUsed: 'rainbot.proxy_used',
      rpcProcedure: 'rainbot.rpc_procedure',
      outcome: 'rainbot.outcome',
      streamType: 'rainbot.stream_type',
      transcoded: 'rainbot.transcoded',
      resolutionPath: 'rainbot.resolution_path',
      phase: 'rainbot.phase',
      ttsProvider: 'rainbot.tts_provider',
      ttsVoice: 'rainbot.tts_voice',
      textLength: 'rainbot.text_length',
      grokModel: 'rainbot.grok_model',
      queueOperation: 'rainbot.queue_operation',
      queueLengthAfter: 'rainbot.queue_length_after',
      grokPromptTokens: 'rainbot.grok_prompt_tokens',
      grokCompletionTokens: 'rainbot.grok_completion_tokens',
      grokTotalTokens: 'rainbot.grok_total_tokens',
    });
  });
});
