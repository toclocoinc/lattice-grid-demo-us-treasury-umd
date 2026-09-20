/**
 * Save a real run of the Treasury fiscal data API to `data/snapshot/`, so the
 * dashboard can also be opened with no network at all.
 *
 * Run it with `node tools/build-snapshot.mjs`. It is a development tool:
 * nothing the page loads imports it.
 *
 * The feed code the page uses is a classic script, not a module, so it cannot
 * be imported. It is run here instead, in this process, exactly as the browser
 * runs it: the file leaves its functions on `globalThis.TreasuryDemo` and they
 * are read from there. One copy of the feed code, used by both.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { readFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'snapshot');

const feedFile = join(here, '..', 'src', 'treasury-feed.js');
runInThisContext(await readFile(feedFile, 'utf8'), { filename: feedFile });
const { fetchDebt, fetchRates, encodeDebt, encodeRate, DEBT_COLUMNS, RATES_COLUMNS } = globalThis.TreasuryDemo;

const started = Date.now();
console.log('Reading the daily debt table...');
const debt = await fetchDebt();
console.log(`  ${debt.length} daily readings, ${debt[0].date} to ${debt[debt.length - 1].date}.`);

console.log('Reading the average interest rates...');
const rates = await fetchRates();
console.log(`  ${rates.length} readings across ${new Set(rates.map((r) => r.security)).size} securities.`);

/* Stored oldest first, so the files are stable and diffable between runs. */
const debtValues = debt.map(encodeDebt);
const rateValues = rates.map(encodeRate);

const seconds = Number(((Date.now() - started) / 1000).toFixed(1));

const meta = {
  fetchedAt: new Date().toISOString(),
  fetchedAtMs: Date.now(),
  seconds,
  debt: debt.length,
  rates: rates.length,
  debtFrom: debt.length ? debt[0].date : null,
  debtTo: debt.length ? debt[debt.length - 1].date : null,
  ratesFrom: rates.length ? rates[0].date : null,
  ratesTo: rates.length ? rates[rates.length - 1].date : null,
  source: 'US Treasury Fiscal Data',
  sourceUrl: 'https://fiscaldata.treasury.gov/datasets/',
  apiUrl: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service',
  licence: 'Public data published by the US Treasury',
  columns: { debt: DEBT_COLUMNS, rates: RATES_COLUMNS },
  securities: [...new Set(rates.map((r) => r.security))],
};

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'debt.json'), JSON.stringify(debtValues));
await writeFile(join(outDir, 'rates.json'), JSON.stringify(rateValues));
await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

const debtBytes = (await stat(join(outDir, 'debt.json'))).size;
const rateBytes = (await stat(join(outDir, 'rates.json'))).size;
console.log(`\nSaved ${debt.length} debt and ${rates.length} rate readings in ${seconds}s.`);
console.log(`debt.json is ${(debtBytes / 1024).toFixed(1)} KB; rates.json is ${(rateBytes / 1024).toFixed(1)} KB.`);
