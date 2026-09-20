const mockDescribeAudio = jest.fn();
const mockTranscribeSpeech = jest.fn();
const mockEmbedText = jest.fn();
const mockUpsertAnalysis = jest.fn();
const mockGetAnalysisSizes = jest.fn();
const mockGetSoundBuffer = jest.fn();
const mockListSounds = jest.fn();

jest.mock('../audioAnalyzer', () => ({
  describeAudio: (...a: unknown[]) => mockDescribeAudio(...a),
}));
jest.mock('../speechTranscript', () => ({
  transcribeSpeech: (...a: unknown[]) => mockTranscribeSpeech(...a),
}));
jest.mock('../embeddings', () => ({ embedText: (...a: unknown[]) => mockEmbedText(...a) }));
jest.mock('../analysisRepo', () => ({
  upsertAnalysis: (...a: unknown[]) => mockUpsertAnalysis(...a),
  getAnalysisSizes: (...a: unknown[]) => mockGetAnalysisSizes(...a),
  detectVectorSupport: jest.fn(async () => false),
}));
jest.mock('../../storage', () => ({
  getSoundBuffer: (...a: unknown[]) => mockGetSoundBuffer(...a),
  listSounds: (...a: unknown[]) => mockListSounds(...a),
}));
jest.mock('../../config', () => ({
  loadConfig: () => ({ soundAnalysisEnabled: true, soundCaptionModel: 'test-model' }),
}));

import { analyzeSound, sweepAnalyzeSounds } from '../analyzeSound';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSoundBuffer.mockResolvedValue(Buffer.from('audio'));
  mockEmbedText.mockResolvedValue([0.1, 0.2]);
  mockUpsertAnalysis.mockResolvedValue(undefined);
});

describe('analyzeSound', () => {
  it('never transcribes a clip classified as sound', async () => {
    mockDescribeAudio.mockResolvedValue({
      kind: 'sound',
      caption: 'a loud air horn blast',
      tags: ['air horn'],
    });

    const result = await analyzeSound('airhorn.ogg');

    expect(mockTranscribeSpeech).not.toHaveBeenCalled();
    expect(result?.transcript).toBeNull();
    expect(result?.kind).toBe('sound');
  });

  it('transcribes a clip classified as speech', async () => {
    mockDescribeAudio.mockResolvedValue({ kind: 'speech', caption: 'a man yells', tags: ['yell'] });
    mockTranscribeSpeech.mockResolvedValue('you are gay');

    const result = await analyzeSound('yougay.ogg');

    expect(mockTranscribeSpeech).toHaveBeenCalledTimes(1);
    expect(result?.transcript).toBe('you are gay');
  });

  it('transcribes a mixed clip and keeps both fields', async () => {
    mockDescribeAudio.mockResolvedValue({
      kind: 'mixed',
      caption: 'shouting over a beat',
      tags: ['shout'],
    });
    mockTranscribeSpeech.mockResolvedValue('lets go');

    const result = await analyzeSound('hype.ogg');

    expect(result?.transcript).toBe('lets go');
    expect(result?.caption).toBe('shouting over a beat');
  });

  it('folds the caption and tags into the search document', async () => {
    mockDescribeAudio.mockResolvedValue({
      kind: 'sound',
      caption: 'a loud air horn blast',
      tags: ['air horn'],
    });

    const result = await analyzeSound('ah.ogg');

    expect(result?.searchDoc).toContain('air horn');
    expect(result?.searchDoc).toContain('blast');
  });

  it('writes nothing when description fails', async () => {
    mockDescribeAudio.mockResolvedValue(null);

    await expect(analyzeSound('broken.ogg')).resolves.toBeNull();
    expect(mockUpsertAnalysis).not.toHaveBeenCalled();
  });

  it('still stores the row when embedding fails', async () => {
    mockDescribeAudio.mockResolvedValue({ kind: 'sound', caption: 'a thud', tags: ['thud'] });
    mockEmbedText.mockResolvedValue(null);

    await expect(analyzeSound('thud.ogg')).resolves.not.toBeNull();
    expect(mockUpsertAnalysis).toHaveBeenCalledWith(expect.anything(), null);
  });
});

describe('sweepAnalyzeSounds', () => {
  beforeEach(() => {
    mockDescribeAudio.mockResolvedValue({ kind: 'sound', caption: 'a thud', tags: ['thud'] });
  });

  it('skips clips whose recorded size is unchanged', async () => {
    mockListSounds.mockResolvedValue([{ name: 'a.ogg', size: 100, createdAt: new Date() }]);
    mockGetAnalysisSizes.mockResolvedValue(new Map([['a.ogg', 100]]));

    await expect(sweepAnalyzeSounds()).resolves.toEqual({ analyzed: 0, skipped: 1, failed: 0 });
  });

  it('re-analyzes a clip whose size changed', async () => {
    mockListSounds.mockResolvedValue([{ name: 'a.ogg', size: 200, createdAt: new Date() }]);
    mockGetAnalysisSizes.mockResolvedValue(new Map([['a.ogg', 100]]));

    await expect(sweepAnalyzeSounds()).resolves.toEqual({ analyzed: 1, skipped: 0, failed: 0 });
  });

  it('re-analyzes everything under force, ignoring recorded sizes', async () => {
    mockListSounds.mockResolvedValue([{ name: 'a.ogg', size: 100, createdAt: new Date() }]);
    mockGetAnalysisSizes.mockResolvedValue(new Map([['a.ogg', 100]]));

    await expect(sweepAnalyzeSounds({ force: true })).resolves.toEqual({
      analyzed: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it('counts a failed clip without aborting the sweep', async () => {
    mockListSounds.mockResolvedValue([
      { name: 'a.ogg', size: 1, createdAt: new Date() },
      { name: 'b.ogg', size: 1, createdAt: new Date() },
    ]);
    mockGetAnalysisSizes.mockResolvedValue(new Map());
    mockDescribeAudio.mockResolvedValueOnce(null);

    await expect(sweepAnalyzeSounds()).resolves.toEqual({ analyzed: 1, skipped: 0, failed: 1 });
  });

  it('isolates a per-clip rejection so the rest of the batch still runs', async () => {
    mockListSounds.mockResolvedValue([
      { name: 'a.ogg', size: 1, createdAt: new Date() },
      { name: 'b.ogg', size: 1, createdAt: new Date() },
    ]);
    mockGetAnalysisSizes.mockResolvedValue(new Map());
    mockUpsertAnalysis.mockRejectedValueOnce(new Error('db exploded'));

    await expect(sweepAnalyzeSounds()).resolves.toEqual({ analyzed: 1, skipped: 0, failed: 1 });
  });

  it('honours a limit', async () => {
    mockListSounds.mockResolvedValue([
      { name: 'a.ogg', size: 1, createdAt: new Date() },
      { name: 'b.ogg', size: 1, createdAt: new Date() },
    ]);
    mockGetAnalysisSizes.mockResolvedValue(new Map());

    await expect(sweepAnalyzeSounds({ limit: 1 })).resolves.toEqual({
      analyzed: 1,
      skipped: 0,
      failed: 0,
    });
  });
});
