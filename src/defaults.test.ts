import { afterEach, describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  defaultApiKey,
  defaultServiceUrl,
  MAX_FILES_COUNT,
  MAX_SOURCE_BYTES,
  MAX_TOTAL_FILES_BYTES,
  resolveLimits,
  utf8ByteLength,
} from './defaults.js';

describe('resolveLimits', () => {
  it('uses library defaults when no overrides are given', () => {
    expect(resolveLimits()).toEqual({
      maxSourceBytes: MAX_SOURCE_BYTES,
      maxFilesCount: MAX_FILES_COUNT,
      maxTotalFilesBytes: MAX_TOTAL_FILES_BYTES,
    });
  });

  it('applies partial overrides, leaving the rest at their defaults', () => {
    expect(resolveLimits({ maxFilesCount: 5 })).toEqual({
      maxSourceBytes: MAX_SOURCE_BYTES,
      maxFilesCount: 5,
      maxTotalFilesBytes: MAX_TOTAL_FILES_BYTES,
    });
  });
});

describe('resolveLimits — env-var fallbacks', () => {
  afterEach(() => {
    delete process.env.PLATEX_MAX_SOURCE_BYTES;
    delete process.env.PLATEX_MAX_FILES_COUNT;
    delete process.env.PLATEX_MAX_TOTAL_FILES_BYTES;
  });

  it('reads PLATEX_MAX_SOURCE_BYTES when no override is given', () => {
    process.env.PLATEX_MAX_SOURCE_BYTES = '1000';
    expect(resolveLimits().maxSourceBytes).toBe(1000);
  });

  it('reads PLATEX_MAX_FILES_COUNT when no override is given', () => {
    process.env.PLATEX_MAX_FILES_COUNT = '10';
    expect(resolveLimits().maxFilesCount).toBe(10);
  });

  it('reads PLATEX_MAX_TOTAL_FILES_BYTES when no override is given', () => {
    process.env.PLATEX_MAX_TOTAL_FILES_BYTES = '5000000';
    expect(resolveLimits().maxTotalFilesBytes).toBe(5_000_000);
  });

  it('programmatic overrides take precedence over env vars', () => {
    process.env.PLATEX_MAX_SOURCE_BYTES = '1000';
    process.env.PLATEX_MAX_FILES_COUNT = '10';
    process.env.PLATEX_MAX_TOTAL_FILES_BYTES = '5000000';
    expect(resolveLimits({ maxSourceBytes: 2000 })).toEqual({
      maxSourceBytes: 2000,
      maxFilesCount: 10,
      maxTotalFilesBytes: 5_000_000,
    });
  });

  it('ignores non-integer env-var values', () => {
    process.env.PLATEX_MAX_SOURCE_BYTES = 'abc';
    expect(resolveLimits().maxSourceBytes).toBe(MAX_SOURCE_BYTES);
  });

  it('ignores zero and negative env-var values', () => {
    process.env.PLATEX_MAX_SOURCE_BYTES = '0';
    expect(resolveLimits().maxSourceBytes).toBe(MAX_SOURCE_BYTES);
    process.env.PLATEX_MAX_SOURCE_BYTES = '-100';
    expect(resolveLimits().maxSourceBytes).toBe(MAX_SOURCE_BYTES);
  });
});

describe('env var fallbacks', () => {
  afterEach(() => {
    delete process.env.PLATEX_SERVICE_URL;
    delete process.env.PLATEX_API_KEY;
  });

  it('defaultServiceUrl() reads PLATEX_SERVICE_URL', () => {
    expect(defaultServiceUrl()).toBeUndefined();
    process.env.PLATEX_SERVICE_URL = 'http://example.test';
    expect(defaultServiceUrl()).toBe('http://example.test');
  });

  it('defaultApiKey() reads PLATEX_API_KEY', () => {
    expect(defaultApiKey()).toBeUndefined();
    process.env.PLATEX_API_KEY = 'sekret';
    expect(defaultApiKey()).toBe('sekret');
  });
});

describe('utf8ByteLength', () => {
  it('matches ASCII string length', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('accounts for multi-byte UTF-8 characters', () => {
    // Each of these characters is 3 bytes in UTF-8.
    expect(utf8ByteLength('日本語')).toBe(9);
  });
});

describe('bytesToBase64', () => {
  it('encodes a Buffer to base64', () => {
    const buf = Buffer.from('hello');
    expect(bytesToBase64(buf)).toBe(buf.toString('base64'));
  });

  it('encodes a plain Uint8Array to base64', () => {
    const bytes = new Uint8Array([104, 101, 108, 108, 111]);
    expect(bytesToBase64(bytes)).toBe('aGVsbG8=');
  });
});

describe('base64ToBytes', () => {
  it('decodes base64 to a Buffer', () => {
    const result = base64ToBytes(Buffer.from('hello').toString('base64'));
    expect(result.toString()).toBe('hello');
  });
});
