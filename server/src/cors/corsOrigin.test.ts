import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  loadServerEnv,
  normalizeCorsOriginEntry,
  resolveCorsOrigins,
  toCorsOriginOption,
} from '../env.js';

const SAVED_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
};

afterEach(() => {
  if (SAVED_ENV.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = SAVED_ENV.NODE_ENV;
  if (SAVED_ENV.CORS_ORIGIN === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = SAVED_ENV.CORS_ORIGIN;
});

describe('normalizeCorsOriginEntry', () => {
  it('accepts absolute http(s) origins and normalizes trailing slash', () => {
    assert.equal(normalizeCorsOriginEntry('http://127.0.0.1:5173'), 'http://127.0.0.1:5173');
    assert.equal(
      normalizeCorsOriginEntry('https://example.com/'),
      'https://example.com',
    );
  });

  it('rejects empty, wildcard, path, query, credentials, and non-http schemes', () => {
    assert.throws(() => normalizeCorsOriginEntry(''), /Invalid CORS_ORIGIN/);
    assert.throws(() => normalizeCorsOriginEntry('*'), /Invalid CORS_ORIGIN/);
    assert.throws(() => normalizeCorsOriginEntry('https://example.com/app'), /path/);
    assert.throws(() => normalizeCorsOriginEntry('https://example.com?x=1'), /query/);
    assert.throws(() => normalizeCorsOriginEntry('https://user:pass@example.com'), /credentials/);
    assert.throws(() => normalizeCorsOriginEntry('ftp://example.com'), /http/);
    assert.throws(() => normalizeCorsOriginEntry('https://*.apps.tossmini.com'), /wildcard/);
    assert.throws(() => normalizeCorsOriginEntry('not a url'), /valid absolute URL/);
  });
});

describe('resolveCorsOrigins — production fail-closed', () => {
  it('rejects missing, empty, whitespace, and *', () => {
    assert.throws(() => resolveCorsOrigins(undefined, 'production'), /required/);
    assert.throws(() => resolveCorsOrigins('', 'production'), /required/);
    assert.throws(() => resolveCorsOrigins('   ', 'production'), /required/);
    assert.throws(() => resolveCorsOrigins('*', 'production'), /not allowed/);
    assert.throws(() => resolveCorsOrigins(' * ', 'production'), /not allowed/);
  });

  it('rejects malformed and wildcard-host entries', () => {
    assert.throws(
      () => resolveCorsOrigins('https://example.com/path', 'production'),
      /path/,
    );
    assert.throws(
      () => resolveCorsOrigins('*,https://example.com', 'production'),
      /Invalid CORS_ORIGIN/,
    );
    assert.throws(
      () => resolveCorsOrigins('https://*.tossmini.com', 'production'),
      /wildcard/,
    );
    assert.throws(() => resolveCorsOrigins('  ,  , ', 'production'), /empty after parsing/);
  });

  it('accepts explicit allowlist and dedupes/normalizes', () => {
    const origins = resolveCorsOrigins(
      'https://a.example.com, http://127.0.0.1:5173/,https://a.example.com/',
      'production',
    );
    assert.deepEqual(origins, ['https://a.example.com', 'http://127.0.0.1:5173']);
  });

  it('does not invent Toss origins when unset', () => {
    assert.throws(() => resolveCorsOrigins(undefined, 'production'), /required/);
    try {
      resolveCorsOrigins(undefined, 'production');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      assert.equal(message.includes('tossmini'), false);
      assert.equal(message.includes('galman-hae'), false);
    }
  });
});

describe('resolveCorsOrigins — non-production local workflow', () => {
  it('defaults unset/empty/* to wildcard', () => {
    assert.equal(resolveCorsOrigins(undefined, 'development'), '*');
    assert.equal(resolveCorsOrigins(undefined, undefined), '*');
    assert.equal(resolveCorsOrigins('', 'development'), '*');
    assert.equal(resolveCorsOrigins('*', 'development'), '*');
    assert.equal(resolveCorsOrigins(' * ', undefined), '*');
  });

  it('parses explicit allowlist in development', () => {
    assert.deepEqual(resolveCorsOrigins('http://127.0.0.1:5173', 'development'), [
      'http://127.0.0.1:5173',
    ]);
  });

  it('still rejects malformed allowlist entries when set', () => {
    assert.throws(
      () => resolveCorsOrigins('https://example.com/oops', 'development'),
      /path/,
    );
  });
});

describe('toCorsOriginOption', () => {
  it('maps * to reflect true and allowlists to cors package values', () => {
    assert.equal(toCorsOriginOption('*'), true);
    assert.equal(toCorsOriginOption(['https://a.example.com']), 'https://a.example.com');
    assert.deepEqual(toCorsOriginOption(['https://a.example.com', 'http://127.0.0.1:5173']), [
      'https://a.example.com',
      'http://127.0.0.1:5173',
    ]);
  });
});

describe('loadServerEnv CORS integration', () => {
  it('production missing CORS_ORIGIN fails closed at load', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    assert.throws(() => loadServerEnv(), /CORS_ORIGIN is required/);
  });

  it('production * fails closed at load', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '*';
    assert.throws(() => loadServerEnv(), /not allowed/);
  });

  it('production allowlist loads', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com,http://127.0.0.1:5173';
    const env = loadServerEnv();
    assert.deepEqual(env.corsOrigins, [
      'https://app.example.com',
      'http://127.0.0.1:5173',
    ]);
    assert.deepEqual(toCorsOriginOption(env.corsOrigins), [
      'https://app.example.com',
      'http://127.0.0.1:5173',
    ]);
  });

  it('development unset keeps *', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGIN;
    const env = loadServerEnv();
    assert.equal(env.corsOrigins, '*');
    assert.equal(toCorsOriginOption(env.corsOrigins), true);
  });
});
