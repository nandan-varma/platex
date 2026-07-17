import { afterEach, describe, expect, it } from 'vitest';
import {
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
