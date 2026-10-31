#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const script = resolve(import.meta.dirname, 'conformance.mjs');
const result = spawnSync(process.execPath, [script], { env: { ...process.env, WRITE_MANIFEST: resolve(import.meta.dirname, '../corpus-manifest.json') }, stdio: 'inherit' });
process.exit(result.status ?? 1);
