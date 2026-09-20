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

import {
  analyzeSound,
  sweepAnalyzeSounds,
  enqueueAnalyzeSound,
  pendingAnalysisCount,
  ANALYSIS_CONCURRENCY,
} from '../analyzeSound';

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

  it('writes nothing when a speech clip cannot be transcribed', async () => {
    mockDescribeAudio.mockResolvedValue({ kind: 'speech', caption: 'a man yells', tags: ['yell'] });
    mockTranscribeSpeech.mockResolvedValue(null);

    // A NULL transcript means "no speech present". Recording that for a clip
    // classified as speech would be the opposite of what happened, and the
    // sweep would never revisit it.
    await expect(analyzeSound('yougay.ogg')).resolves.toBeNull();
    expect(mockUpsertAnalysis).not.toHaveBeenCalled();
  });

  it('writes nothing when a mixed clip cannot be transcribed', async () => {
    mockDescribeAudio.mockResolvedValue({
      kind: 'mixed',
      caption: 'shouting over a beat',
      tags: ['shout'],
    });
    mockTranscribeSpeech.mockResolvedValue(null);

    await expect(analyzeSound('hype.ogg')).resolves.toBeNull();
    expect(mockUpsertAnalysis).not.toHaveBeenCalled();
  });

  it('still writes a null transcript for a clip that genuinely has no speech', async () => {
    mockDescribeAudio.mockResolvedValue({ kind: 'sound', caption: 'a thud', tags: ['thud'] });

    const result = await analyzeSound('thud.ogg');

    expect(result?.transcript).toBeNull();
    expect(mockUpsertAnalysis).toHaveBeenCalledTimes(1);
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

describe('enqueueAnalyzeSound', () => {
  /** Lets a test hold analyses open so the queue's width can be observed. */
  function gate() {
    const releases: Array<() => void> = [];
    mockDescribeAudio.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ kind: 'sound', caption: 'a thud', tags: ['thud'] }));
        })
    );
    return releases;
  }

  /** Runs the microtask/immediate queues until the shared queue is idle. */
  async function settle(maxTicks = 50): Promise<void> {
    for (let tick = 0; tick < maxTicks; tick += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      const { active, queued } = pendingAnalysisCount();
      if (active === 0 && queued === 0) return;
    }
  }

  afterEach(async () => {
    await settle();
  });

  it('never runs more analyses at once than the sweep would', async () => {
    const releases = gate();
    const names = Array.from({ length: 10 }, (_, i) => `clip${i}.ogg`);

    // A single upload request may carry MAX_UPLOAD_FILES clips.
    for (const name of names) enqueueAnalyzeSound(name);
    await new Promise((resolve) => setImmediate(resolve));

    expect(pendingAnalysisCount()).toEqual({
      active: ANALYSIS_CONCURRENCY,
      queued: names.length - ANALYSIS_CONCURRENCY,
    });
    expect(mockDescribeAudio).toHaveBeenCalledTimes(ANALYSIS_CONCURRENCY);

    // Drain one slot at a time, checking the ceiling holds as it is handed on.
    for (let released = 0; released < names.length; released += 1) {
      const release = releases.shift();
      expect(release).toBeDefined();
      release!();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(pendingAnalysisCount().active).toBeLessThanOrEqual(ANALYSIS_CONCURRENCY);
    }

    await settle();
    expect(mockDescribeAudio).toHaveBeenCalledTimes(names.length);
    expect(pendingAnalysisCount()).toEqual({ active: 0, queued: 0 });
  });

  it('returns before the analysis finishes', async () => {
    const releases = gate();

    enqueueAnalyzeSound('clip.ogg');

    expect(mockUpsertAnalysis).not.toHaveBeenCalled();
    expect(pendingAnalysisCount().active).toBe(1);

    await new Promise((resolve) => setImmediate(resolve));
    releases.forEach((release) => release());
    await settle();
    expect(pendingAnalysisCount()).toEqual({ active: 0, queued: 0 });
  });

  it('absorbs a rejection and keeps draining the queue', async () => {
    mockDescribeAudio.mockResolvedValue({ kind: 'sound', caption: 'a thud', tags: ['thud'] });
    mockGetSoundBuffer.mockRejectedValueOnce(new Error('storage down'));
    mockUpsertAnalysis.mockRejectedValueOnce(new Error('db exploded'));

    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      for (const name of ['a.ogg', 'b.ogg', 'c.ogg', 'd.ogg']) enqueueAnalyzeSound(name);
      await settle();
    } finally {
      process.off('unhandledRejection', unhandled);
    }

    // All four ran despite two of them failing, and nothing escaped.
    expect(unhandled).not.toHaveBeenCalled();
    expect(mockDescribeAudio).toHaveBeenCalledTimes(3);
    expect(pendingAnalysisCount()).toEqual({ active: 0, queued: 0 });
  });
});
