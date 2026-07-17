#!/usr/bin/env node
/**
 * Downloads the Tectonic TeX engine binary for the current platform.
 * Run during `npm run build:vercel` so Vercel includes it in the function bundle.
 */

import { createWriteStream, mkdirSync, chmodSync, existsSync, readFileSync, rmSync } from 'fs';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
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

// Tectonic's GitHub releases don't publish checksums, so these are pinned by
// hand (computed from the release assets for VERSION) to protect against a
// tampered or substituted release asset — the binary is executed unsandboxed
// during every local/serverless compile, so its integrity matters.
const SHA256_MAP = {
  'x86_64-unknown-linux-musl': 'dfb82876f2986862996e564fa507a9e576e0c1e3bee63c2c1bd677c2543e6407',
  'aarch64-unknown-linux-musl': '1f59f9fb8eb65e8ba18658fc9016767e7d3e12488ded8b8fffa34254e51ce42c',
  'x86_64-apple-darwin': 'dd42576eaa4c0df58c243dd78b7b864d9deb405ffdfcdadd1b79a31faceab747',
  'aarch64-apple-darwin': '24bd46566fa30d41101848405e9cbc4645edb92d8f857c9d21262174fb70cd33',
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

console.log('Verifying checksum...');
const expectedSha256 = SHA256_MAP[target];
const actualSha256 = createHash('sha256').update(readFileSync(tarPath)).digest('hex');
if (!expectedSha256 || actualSha256 !== expectedSha256) {
  rmSync(tarPath, { force: true });
  console.error(
    `Checksum mismatch for ${filename}:\n  expected ${expectedSha256 ?? '(none pinned)'}\n  got      ${actualSha256}\n` +
      'Refusing to install a Tectonic binary that does not match the pinned checksum.',
  );
  process.exit(1);
}

console.log('Extracting...');
execSync(`tar -xzf "${tarPath}" -C "${BIN_DIR}"`);
chmodSync(BINARY, 0o755);

// Clean up the archive
rmSync(tarPath, { force: true });

console.log(`Tectonic installed at bin/tectonic`);
