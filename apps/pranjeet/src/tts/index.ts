import { logErrorWithStack } from '@rainbot/worker-shared';
import { resample24to48 } from '../audio/utils';
import { log, TTS_API_KEY, TTS_PROVIDER, TTS_VOICE } from '../config';

let ttsClient: unknown = null;

export function normalizeSpeakKey(text: string, voice?: string): string {
  return `${(voice || '').trim().toLowerCase()}::${text.trim().toLowerCase()}`;
}

export async function initTTS(): Promise<void> {
  if (TTS_PROVIDER === 'openai' && TTS_API_KEY) {
    try {
      const { OpenAI } = await import('openai');
      ttsClient = new OpenAI({ apiKey: TTS_API_KEY });
      log.info('OpenAI TTS client initialized');
    } catch (error) {
      logErrorWithStack(log, 'Failed to initialize OpenAI TTS', error);
    }
  } else if (TTS_PROVIDER === 'google' && TTS_API_KEY) {
    try {
      const textToSpeech = await import('@google-cloud/text-to-speech');
      ttsClient = new textToSpeech.TextToSpeechClient({ apiKey: TTS_API_KEY });
      log.info('Google TTS client initialized');
    } catch (error) {
      logErrorWithStack(log, 'Failed to initialize Google TTS', error);
    }
  } else {
    log.warn('No TTS API key configured - TTS will not work');
  }
}

export async function generateTTS(text: string, voice?: string): Promise<Buffer> {
  log.info(`Generating TTS for: "${text.substring(0, 50)}..."`);
  if (!ttsClient) {
    log.error('TTS client not initialized');
    throw new Error('TTS not configured');
  }
  if (TTS_PROVIDER === 'openai') {
    return generateOpenAITTS(text, voice);
  }
  if (TTS_PROVIDER === 'google') {
    return generateGoogleTTS(text, voice);
  }
  throw new Error(`Unsupported TTS provider: ${TTS_PROVIDER}`);
}

async function generateOpenAITTS(text: string, voice?: string): Promise<Buffer> {
  const openai = ttsClient as {
    audio: {
      speech: { create: (opts: unknown) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }> };
    };
  };
  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const voiceName = voice || TTS_VOICE;
  const selectedVoice = validVoices.includes(voiceName) ? voiceName : 'alloy';
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: selectedVoice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: text,
    response_format: 'pcm',
    speed: 1.0,
  });
  const pcm24k = Buffer.from(await response.arrayBuffer());
  return resample24to48(pcm24k);
}

async function generateGoogleTTS(text: string, voice?: string): Promise<Buffer> {
  const client = ttsClient as {
    synthesizeSpeech: (req: unknown) => Promise<[{ audioContent?: Uint8Array }]>;
  };
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: voice || TTS_VOICE || 'en-US-Neural2-J',
    },
    audioConfig: {
      audioEncoding: 'LINEAR16' as const,
      sampleRateHertz: 48000,
    },
  });
  if (!response.audioContent) {
    throw new Error('No audio content in TTS response');
  }
  return Buffer.from(response.audioContent);
}
