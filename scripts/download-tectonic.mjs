#!/usr/bin/env node
/**
 * Downloads the Tectonic TeX engine binary for the current platform.
 * Run during `npm run build:vercel` so Vercel includes it in the function bundle.
 */

import { createWriteStream, mkdirSync, chmodSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BIN_DIR = join(ROOT, 'bin');
const BINARY = join(BIN_DIR, 'tectonic');
const VERSION = '0.15.0';

const TARGET_MAP = {
  'linux-x64': 'x86_64-unknown-linux-musl',
  'linux-arm64': 'aarch64-unknown-linux-musl',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
};

const platform = `${process.platform === 'linux' ? 'linux' : 'darwin'}-${
  process.arch === 'arm64' ? 'arm64' : 'x64'
}`;

const target = TARGET_MAP[platform];
if (!target) {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

const filename = `tectonic-${VERSION}-${target}.tar.gz`;
const url = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${VERSION}/${filename}`;

if (existsSync(BINARY)) {
  console.log(`Tectonic binary already present at bin/tectonic — skipping download.`);
  process.exit(0);
}

console.log(`Downloading Tectonic ${VERSION} for ${platform}...`);
console.log(`  ${url}`);

mkdirSync(BIN_DIR, { recursive: true });

const tarPath = join(BIN_DIR, filename);

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const MAX_REDIRECTS = 5;
    function follow(url, redirectCount = 0) {
      if (redirectCount > MAX_REDIRECTS) {
        reject(new Error(`Too many redirects (${MAX_REDIRECTS}) for ${url}`));
        return;
      }
      get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location, redirectCount + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const out = createWriteStream(dest);
        pipeline(res, out).then(resolve).catch(reject);
      }).on('error', reject);
    }
    follow(url);
  });
}

await download(url, tarPath);
console.log('Extracting...');

execSync(`tar -xzf "${tarPath}" -C "${BIN_DIR}"`);
chmodSync(BINARY, 0o755);

// Clean up the archive
execSync(`rm -f "${tarPath}"`);

console.log(`Tectonic installed at bin/tectonic`);
