import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { RainbotAttr } from '@rainbot/observability/node';
import { createAudioResource, StreamType } from '@discordjs/voice';
import play from 'play-dl';
import type { Track } from '@rainbot/protocol';
import { createTrackResourceForAny } from '../audioResource';

// These two dark paths (the play-dl fallback after both yt-dlp attempts fail,
// and every non-YouTube source) were previously uninstrumented, so playback
// on them left no `audio.resource.create` span at all. Both yt-dlp call
// shapes (the plain call used by getStreamUrl, and .exec used by the pipe)
// are mocked to fail fast so `createTrackResourceForAny` reliably falls
// through to the play-dl paths under test.
jest.mock('@discordjs/voice', () => {
  const actual = jest.requireActual('@discordjs/voice');
  return {
    ...actual,
    createAudioResource: jest.fn(),
  };
});

jest.mock('play-dl', () => ({
  __esModule: true,
  default: {
    stream: jest.fn(),
    validate: jest.fn(),
  },
}));

jest.mock('youtube-dl-exec', () => {
  const mockCall = jest.fn();
  const mockExec = jest.fn();
  const fn = (...args: unknown[]) => mockCall(...args);
  (fn as unknown as { exec: (...args: unknown[]) => unknown }).exec = (...args: unknown[]) =>
    mockExec(...args);
  return {
    __esModule: true,
    default: { create: jest.fn(() => fn) },
    __mockCall: mockCall,
    __mockExec: mockExec,
  };
});

const { __mockCall: mockYtdlpCall, __mockExec: mockYtdlpExec } = jest.requireMock(
  'youtube-dl-exec'
) as { __mockCall: jest.Mock; __mockExec: jest.Mock };

const mockCreateAudioResource = createAudioResource as jest.Mock;
const mockPlayStream = play.stream as jest.Mock;
const mockPlayValidate = play.validate as jest.Mock;

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  );
});

beforeEach(() => {
  exporter.reset();
  mockCreateAudioResource.mockReset().mockReturnValue({ fakeResource: true });
  mockPlayStream.mockReset();
  mockPlayValidate.mockReset();
  mockYtdlpCall.mockReset();
  mockYtdlpExec.mockReset();
});

function youtubeTrack(): Track {
  return {
    title: 'Test Song',
    url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    sourceType: 'youtube',
  };
}

function soundcloudTrack(): Track {
  return {
    title: 'SC Track',
    url: 'https://soundcloud.com/artist/track',
    sourceType: 'soundcloud',
  };
}

function findAudioResourceCreateSpan() {
  return exporter.getFinishedSpans().find((s) => s.name === 'audio.resource.create');
}

describe('createTrackResourceForAny — audio.resource.create on the play-dl paths', () => {
  it('spans the play-dl fallback (both yt-dlp attempts failed) with resolutionPath=play-dl-fallback', async () => {
    jest.useFakeTimers();
    try {
      mockYtdlpCall.mockRejectedValue(new Error('get-url failed'));
      mockYtdlpExec.mockImplementation(() => Promise.reject(new Error('pipe failed')));
      mockPlayStream.mockResolvedValue({ stream: 'fake-stream', type: StreamType.Opus });

      const resource = await createTrackResourceForAny(youtubeTrack());

      expect(resource).toEqual({ fakeResource: true });
      const span = findAudioResourceCreateSpan();
      expect(span).toBeDefined();
      expect(span!.attributes[RainbotAttr.resolutionPath]).toBe('play-dl-fallback');
      expect(span!.attributes[RainbotAttr.trackSource]).toBe('youtube');
      expect(span!.attributes[RainbotAttr.streamType]).toBe(StreamType.Opus);
      expect(span!.attributes[RainbotAttr.transcoded]).toBe(false);
      expect(span!.status.code).toBe(SpanStatusCode.UNSET);
    } finally {
      jest.useRealTimers();
    }
  });

  it('spans every non-YouTube resource (SoundCloud/Spotify-resolved) with resolutionPath=play-dl-direct', async () => {
    mockPlayValidate.mockResolvedValue('so_track');
    mockPlayStream.mockResolvedValue({ stream: 'fake-stream', type: StreamType.Arbitrary });

    const resource = await createTrackResourceForAny(soundcloudTrack());

    expect(resource).toEqual({ fakeResource: true });
    const span = findAudioResourceCreateSpan();
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.resolutionPath]).toBe('play-dl-direct');
    expect(span!.attributes[RainbotAttr.trackSource]).toBe('soundcloud');
    expect(span!.attributes[RainbotAttr.transcoded]).toBe(true);
    expect(span!.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('marks the play-dl-direct span ERROR and propagates the same error when resource creation throws', async () => {
    mockPlayValidate.mockResolvedValue('so_track');
    mockPlayStream.mockResolvedValue({ stream: 'fake-stream', type: StreamType.Arbitrary });
    const boom = new Error('bad pipeline');
    mockCreateAudioResource.mockImplementation(() => {
      throw boom;
    });

    await expect(createTrackResourceForAny(soundcloudTrack())).rejects.toBe(boom);

    const span = findAudioResourceCreateSpan();
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.resolutionPath]).toBe('play-dl-direct');
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
  });
});
