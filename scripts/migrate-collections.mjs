#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildMigrationModel,
  migrationReport,
  renderBackfillSql,
  renderD1BackfillSql,
} from './lib/collections-migration.mjs';

function usage() {
  console.log(`Usage:
  node scripts/migrate-collections.mjs --snapshot sync-state.json [--out generated/collections-backfill.sql]
    [--d1-out migrations/0004_collections_backfill.sql]
  node scripts/migrate-collections.mjs --snapshot sync-state.json --database cloned.sqlite --apply

Default behavior is dry-run only: generate SQL and a report. --apply is accepted
only with a local/cloned SQLite file and creates a byte-for-byte backup first.
--d1-out writes a transaction-wrapper-free artifact for Wrangler D1 migrations;
it never applies that artifact.`);
}

function argumentsFrom(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--apply') options.apply = true;
    else if (value === '--help' || value === '-h') options.help = true;
    else if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`${value} requires a value.`);
      options[key] = next;
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

async function readSnapshot(path) {
  const payload = JSON.parse(await readFile(path, 'utf8'));
  if (payload?.protocol === 2) return payload;
  if (payload?.state?.protocol === 2) return payload.state;
  throw new Error('Snapshot file must contain a sync-v2 state response.');
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.snapshot) throw new Error('--snapshot is required.');
  if (options.apply && !options.database) throw new Error('--apply requires --database pointing to a cloned/local SQLite file.');

  const root = resolve(import.meta.dirname, '..');
  const snapshotPath = resolve(options.snapshot);
  const outputPath = resolve(options.out || `${root}/generated/collections-backfill.sql`);
  const reportPath = resolve(options.report || outputPath.replace(/\.sql$/i, '.report.json'));
  const model = buildMigrationModel(await readSnapshot(snapshotPath));
  const sql = renderBackfillSql(model);
  const report = migrationReport(model);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, sql, 'utf8');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`Generated ${outputPath}`);
  console.log(`Generated ${reportPath}`);
  const hasErrors = report.issues.some(issue => issue.severity === 'error');
  if (options['d1-out']) {
    if (hasErrors) throw new Error('Migration report contains error-level issues; refusing to generate a deployable D1 artifact.');
    const d1OutputPath = resolve(options['d1-out']);
    await mkdir(dirname(d1OutputPath), { recursive: true });
    await writeFile(d1OutputPath, renderD1BackfillSql(model), 'utf8');
    console.log(`Generated ${d1OutputPath} (D1 migration artifact; not applied)`);
  }
  console.log(`Resources: ${report.source.resources}; warnings: ${report.issues.filter(issue => issue.severity === 'warning').length}; errors: ${report.issues.filter(issue => issue.severity === 'error').length}`);

  if (!options.apply) {
    console.log('Dry run complete. No database was changed.');
    return;
  }
  if (hasErrors) {
    throw new Error('Migration report contains error-level issues; refusing to apply.');
  }

  const databasePath = resolve(options.database);
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const backupPath = `${databasePath}.before-collections-${stamp}.bak`;
  await copyFile(databasePath, backupPath);
  console.log(`Backup created: ${backupPath}`);

  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys=ON;');
    const meta = db.prepare('SELECT epoch,head FROM sync_v2_meta WHERE id=1').get();
    if (!meta || meta.epoch !== model.epoch || meta.head !== model.head) {
      throw new Error(`Snapshot epoch/head does not match ${basename(databasePath)}; no migration was applied.`);
    }
    for (const file of [
      'migrations/0001_collections_migration_runtime.sql',
      'migrations/0002_collections_schema.sql',
      'migrations/0003_collections_indexes.sql',
    ]) {
      db.exec(await readFile(resolve(root, file), 'utf8'));
    }
    const existing = db.prepare('SELECT checksum,state FROM app_schema_migrations WHERE version=?').get(model.migrationVersion);
    if (existing && existing.checksum !== model.checksum) {
      throw new Error('Migration version already exists with a different checksum; refusing to overwrite it.');
    }
    if (existing?.state === 'verified') {
      console.log('This exact migration is already verified; no changes were required.');
      return;
    }
    db.exec(sql);
    console.log('Applied migration to the cloned/local database.');
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
