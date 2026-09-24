/**
 * Attribute names are the contract with Grafana dashboards and alert rules: a
 * rename here silently breaks every query that used the old name. They live in
 * one frozen object so both the bots and the browser bundle describe the same
 * thing with the same key.
 */
export const RainbotAttr = Object.freeze({
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
} as const);

export type RainbotAttrName = (typeof RainbotAttr)[keyof typeof RainbotAttr];
