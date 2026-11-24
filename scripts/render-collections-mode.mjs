#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildMigrationModel,
  renderCollectionsModeSql,
} from './lib/collections-migration.mjs';

function parseArgs(argv) {
  const options = { mode: 'active' };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--help' || value === '-h') options.help = true;
    else if (value.startsWith('--')) {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`${value} requires a value.`);
      options[value.slice(2)] = next;
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function usage() {
  console.log(`Usage:
  node scripts/render-collections-mode.mjs --snapshot sync-state.json --mode active --out migrations/0005_collections_activate.sql
  node scripts/render-collections-mode.mjs --snapshot sync-state.json --mode retired --out generated/collections-retire.sql

This command only renders guarded SQL. It never connects to or mutates D1.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.snapshot || !options.out) throw new Error('--snapshot and --out are required.');
  if (!['active', 'retired'].includes(options.mode)) throw new Error('--mode must be active or retired.');
  const payload = JSON.parse(await readFile(resolve(options.snapshot), 'utf8'));
  const snapshot = payload?.protocol === 2 ? payload : payload?.state;
  const model = buildMigrationModel(snapshot);
  const output = resolve(options.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderCollectionsModeSql(model, options.mode), 'utf8');
  console.log(`Generated guarded Collections ${options.mode} SQL: ${output}`);
  console.log('No database was changed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
