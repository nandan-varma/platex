import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app depends on platex via a `file:../..` link, and the parent repo
  // has its own package-lock.json — pin the trace root here so Next.js
  // doesn't guess (and warn) about which lockfile owns the workspace.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
