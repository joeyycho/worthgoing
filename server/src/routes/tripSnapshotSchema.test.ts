import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { tripSnapshotSchema } from './tripSnapshotSchema.js';

const savedBodySchema = z.object({ snapshot: tripSnapshotSchema });
const sharedBodySchema = z.object({ snapshot: tripSnapshotSchema });

function baseSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    capturedAt: '2026-11-18T12:00:00.000Z',
    form: {
      budgetPerPerson: 800_000,
      travelers: 2,
      tripLengthDays: 3,
    },
    recommendation: {
      destination: { id: 'osaka', city: '오사카', airportCode: 'KIX' },
      flight: {
        isMock: true,
        priceMode: 'mock',
        totalKrw: 120_000,
      },
      lodging: {
        isMock: true,
        priceMode: 'mock',
        totalKrw: 90_000,
      },
      isMock: true,
    },
    isMock: true,
    storageKind: 'supabase' as const,
    ...overrides,
  };
}

describe('tripSnapshotSchema (save/share)', () => {
  it('accepts mock isMock:true on saved-trips body shape', () => {
    const parsed = savedBodySchema.parse({ snapshot: baseSnapshot({ isMock: true }) });
    assert.equal(parsed.snapshot.isMock, true);
  });

  it('accepts live isMock:false on saved-trips body shape', () => {
    const live = baseSnapshot({
      isMock: false,
      recommendation: {
        destination: { id: 'tokyo', city: '도쿄', airportCode: 'NRT' },
        flight: { isMock: false, priceMode: 'live', totalKrw: 210_000 },
        lodging: { isMock: false, priceMode: 'live', totalKrw: 180_000 },
        isMock: false,
      },
    });
    const parsed = savedBodySchema.parse({ snapshot: live });
    assert.equal(parsed.snapshot.isMock, false);
  });

  it('accepts mock and live on shared-trips body shape', () => {
    assert.equal(
      sharedBodySchema.parse({ snapshot: baseSnapshot({ isMock: true }) }).snapshot.isMock,
      true,
    );
    assert.equal(
      sharedBodySchema.parse({ snapshot: baseSnapshot({ isMock: false }) }).snapshot.isMock,
      false,
    );
  });

  it('rejects non-boolean isMock', () => {
    assert.throws(
      () => tripSnapshotSchema.parse(baseSnapshot({ isMock: 'true' })),
      (error: unknown) => error instanceof z.ZodError,
    );
    assert.throws(
      () => tripSnapshotSchema.parse(baseSnapshot({ isMock: 1 })),
      (error: unknown) => error instanceof z.ZodError,
    );
    assert.throws(
      () => tripSnapshotSchema.parse(baseSnapshot({ isMock: null })),
      (error: unknown) => error instanceof z.ZodError,
    );
  });

  it('rejects missing isMock (does not default / upgrade to live)', () => {
    const { isMock: _omit, ...without } = baseSnapshot();
    void _omit;
    assert.throws(
      () => tripSnapshotSchema.parse(without),
      (error: unknown) => error instanceof z.ZodError,
    );
  });

  it('preserves nested priceMode exactly (live + mock)', () => {
    const live = baseSnapshot({
      isMock: false,
      recommendation: {
        destination: { id: 'fukuoka' },
        flight: { isMock: false, priceMode: 'live' },
        lodging: { isMock: false, priceMode: 'indicative' },
        isMock: false,
      },
    });
    const parsedLive = tripSnapshotSchema.parse(live);
    const recLive = parsedLive.recommendation as {
      flight: { priceMode: string; isMock: boolean };
      lodging: { priceMode: string; isMock: boolean };
    };
    assert.equal(recLive.flight.priceMode, 'live');
    assert.equal(recLive.lodging.priceMode, 'indicative');
    assert.equal(recLive.flight.isMock, false);

    const mock = tripSnapshotSchema.parse(baseSnapshot());
    const recMock = mock.recommendation as {
      flight: { priceMode: string };
      lodging: { priceMode: string };
    };
    assert.equal(recMock.flight.priceMode, 'mock');
    assert.equal(recMock.lodging.priceMode, 'mock');
  });

  it('legacy compat: mock snapshot without nested priceMode still accepted', () => {
    const legacy = baseSnapshot({
      isMock: true,
      recommendation: {
        destination: { id: 'osaka' },
        flight: { totalKrw: 100_000 },
        lodging: { totalKrw: 80_000 },
        isMock: true,
      },
    });
    const parsed = tripSnapshotSchema.parse(legacy);
    assert.equal(parsed.isMock, true);
    const rec = parsed.recommendation as {
      flight: { priceMode?: string; totalKrw: number };
      lodging: { priceMode?: string };
    };
    assert.equal(rec.flight.priceMode, undefined);
    assert.equal(rec.flight.totalKrw, 100_000);
  });

  it('incomplete nested provenance is not upgraded to live by schema', () => {
    const incomplete = baseSnapshot({
      isMock: true,
      recommendation: {
        destination: { id: 'osaka' },
        flight: { isMock: true },
        lodging: { totalKrw: 50_000 },
      },
    });
    const parsed = tripSnapshotSchema.parse(incomplete);
    assert.equal(parsed.isMock, true);
    const rec = parsed.recommendation as {
      flight: { isMock?: boolean; priceMode?: string };
      lodging: { isMock?: boolean; priceMode?: string };
    };
    assert.equal(rec.flight.isMock, true);
    assert.equal(rec.flight.priceMode, undefined);
    assert.equal(rec.lodging.isMock, undefined);
    assert.equal(rec.lodging.priceMode, undefined);
    // Schema must not invent live provenance
    assert.notEqual(rec.flight.priceMode, 'live');
    assert.notEqual(rec.lodging.priceMode, 'live');
    assert.notEqual(rec.lodging.isMock, false);
  });
});
