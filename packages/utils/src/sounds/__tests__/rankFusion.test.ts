import { fuseRankings, pinExactPrefix } from '../rankFusion';

describe('fuseRankings', () => {
  it('ranks a name appearing in both lists above one appearing in either alone', () => {
    const fused = fuseRankings([
      { source: 'name', names: ['a.ogg', 'b.ogg'] },
      { source: 'semantic', names: ['b.ogg', 'c.ogg'] },
    ]);
    expect(fused[0]?.name).toBe('b.ogg');
  });

  it('records every source that contributed a hit', () => {
    const fused = fuseRankings([
      { source: 'name', names: ['b.ogg'] },
      { source: 'semantic', names: ['b.ogg'] },
    ]);
    expect(fused[0]?.sources).toEqual(['name', 'semantic']);
  });

  it('preserves within-list order when only one list contributes', () => {
    const fused = fuseRankings([{ source: 'name', names: ['a.ogg', 'b.ogg', 'c.ogg'] }]);
    expect(fused.map((hit) => hit.name)).toEqual(['a.ogg', 'b.ogg', 'c.ogg']);
  });

  it('ignores empty lists', () => {
    const fused = fuseRankings([
      { source: 'name', names: [] },
      { source: 'semantic', names: ['x.ogg'] },
    ]);
    expect(fused.map((hit) => hit.name)).toEqual(['x.ogg']);
  });

  it('deduplicates a name repeated within one list', () => {
    const fused = fuseRankings([{ source: 'name', names: ['a.ogg', 'a.ogg'] }]);
    expect(fused).toHaveLength(1);
  });
});

describe('pinExactPrefix', () => {
  it('lifts a normalized prefix match to the front', () => {
    const hits = [
      { name: 'loud.ogg', score: 0.9, sources: ['semantic' as const] },
      { name: 'airhorn.ogg', score: 0.1, sources: ['name' as const] },
    ];
    expect(pinExactPrefix(hits, 'air horn')[0]?.name).toBe('airhorn.ogg');
  });

  it('leaves order alone when nothing matches the prefix', () => {
    const hits = [
      { name: 'loud.ogg', score: 0.9, sources: ['semantic' as const] },
      { name: 'quiet.ogg', score: 0.1, sources: ['name' as const] },
    ];
    expect(pinExactPrefix(hits, 'trombone').map((hit) => hit.name)).toEqual([
      'loud.ogg',
      'quiet.ogg',
    ]);
  });

  it('returns hits unchanged for an empty query', () => {
    const hits = [{ name: 'a.ogg', score: 1, sources: ['name' as const] }];
    expect(pinExactPrefix(hits, '')).toEqual(hits);
  });
});
