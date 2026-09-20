/**
 * The US Treasury fiscal data feeds: the "debt to the penny" table and the
 * average interest rates table, fetched from the public fiscal data API and
 * turned into flat rows.
 *
 * Nothing here knows about the grid. It produces plain objects and hands them
 * to whoever asked, so the same code feeds the live page and the saved copy.
 *
 * The API is public and needs no key, and it answers cross-origin. Two
 * endpoints are read:
 *
 *   /v2/accounting/od/debt_to_penny    daily total public debt outstanding,
 *                                       back to 1993 (about 8,400 rows)
 *   /v2/accounting/od/avg_interest_rates
 *                                       month-end average interest rates by
 *                                       security, back to 2001
 *
 * Both use the `page[size]` query parameter (JSON:API style) to bound the
 * window; the debt table fits in one request. Only the marketable securities
 * are kept from the rates table, because that is the line the dashboard
 * charts.
 *
 * This is a classic script, not a module: there is no `import` or `export`
 * anywhere on this page. What this file offers is put on `TreasuryDemo`, a
 * plain object on the global, and the next script reads it from there. The
 * snapshot tool runs this same file under Node, which is why it looks for
 * `globalThis` rather than `window`.
 */
(function (root) {
  'use strict';

  const BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
  const DEBT_PATH = '/v2/accounting/od/debt_to_penny';
  const RATES_PATH = '/v2/accounting/od/avg_interest_rates';

  /** The fields asked for, kept short to keep each response small. */
  const DEBT_FIELDS = 'record_date,tot_pub_debt_out_amt,debt_held_public_amt';
  const RATES_FIELDS = 'record_date,security_desc,avg_interest_rate_amt';

  /** The marketable securities the rates table is narrowed to. The raw table
      also holds non-marketable series and a few inconsistently named rows;
      these five are the clean, comparable line. */
  const SECURITIES = [
    'Treasury Bills',
    'Treasury Notes',
    'Treasury Bonds',
    'Treasury Inflation-Protected Securities (TIPS)',
    'Treasury Floating Rate Notes (FRN)',
  ];

  /** How often the live page asks the API for changes. Debt is published and
      revised daily, so this is deliberately slow. */
  const POLL_MS = 15 * 60 * 1000;

  /** The order the snapshot stores the debt fields in, so a compact array can
      be decoded back into a row. Shared by the browser and the snapshot tool. */
  const DEBT_COLUMNS = ['id', 'date', 'debt', 'heldPublic', 'changePct', 'direction'];

  /** The same, for the rates rows. */
  const RATES_COLUMNS = ['id', 'date', 'security', 'rate'];

  /**
   * Fetch JSON from the API, retrying a moment later when the service asks us
   * to slow down or has a wobble. The fiscal data API rate-limits bursts, so a
   * quick pause and retry is enough rather than giving up.
   *
   * @param {string} url the endpoint
   * @param {string} describe what is being read, for the error message
   * @param {{signal?: AbortSignal}} [opts]
   * @returns {Promise<object>} the parsed body
   */
  async function requestJson(url, describe, opts = {}) {
    const maxAttempts = 4;
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(url, { signal: opts.signal, cache: 'no-store' });
      if (response.ok) return response.json();
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        continue;
      }
      throw new Error(`The ${describe} answered ${response.status}.`);
    }
  }

  /** A monetary string from the API to a number, or null when there is none. */
  function toNumber(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Turn the daily debt records into rows, ordered oldest first, with the
   * day-over-day change and direction computed as it goes. The API returns the
   * newest first, so the rows are re-ordered here: a change needs the reading
   * the day before, not the day after.
   *
   * @param {object[]} records the `data` array of a debt_to_penny response
   * @returns {object[]} rows, oldest first
   */
  function buildDebtRows(records) {
    const rows = [];
    for (const rec of records || []) {
      if (!rec || !rec.record_date) continue;
      const debt = toNumber(rec.tot_pub_debt_out_amt);
      const heldPublic = toNumber(rec.debt_held_public_amt);
      if (debt == null) continue;
      rows.push({ id: rec.record_date, date: rec.record_date, debt, heldPublic });
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let previous = null;
    for (const row of rows) {
      if (previous && previous.debt) {
        row.changePct = ((row.debt - previous.debt) / previous.debt) * 100;
        row.direction = row.debt > previous.debt ? 'up' : row.debt < previous.debt ? 'down' : 'flat';
      } else {
        row.changePct = null;
        row.direction = 'flat';
      }
      previous = row;
    }
    return rows;
  }

  /**
   * Turn the average interest rate records into rows, keeping only the chosen
   * securities, ordered by date then security.
   *
   * @param {object[]} records the `data` array of an avg_interest_rates response
   * @returns {object[]} rows
   */
  function buildRateRows(records) {
    const rows = [];
    for (const rec of records || []) {
      if (!rec || !rec.record_date) continue;
      if (SECURITIES.indexOf(rec.security_desc) === -1) continue;
      const rate = toNumber(rec.avg_interest_rate_amt);
      if (rate == null) continue;
      rows.push({
        id: `${rec.record_date}|${rec.security_desc}`,
        date: rec.record_date,
        security: rec.security_desc,
        rate,
      });
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.security < b.security ? -1 : 1));
    return rows;
  }

  /** Read the daily debt series, newest row last. */
  async function fetchDebt(opts = {}) {
    const url = `${BASE}${DEBT_PATH}?fields=${DEBT_FIELDS}&sort=-record_date&page%5Bsize%5D=10000`;
    const body = await requestJson(url, 'debt to the penny', opts);
    return buildDebtRows(body.data);
  }

  /** Read the average interest rates, narrowed to the marketable securities. */
  async function fetchRates(opts = {}) {
    const url = `${BASE}${RATES_PATH}?fields=${RATES_FIELDS}&sort=-record_date&page%5Bsize%5D=10000`;
    const body = await requestJson(url, 'average interest rates', opts);
    return buildRateRows(body.data);
  }

  /**
   * Read the live page's starting data: both tables, in parallel.
   *
   * @param {{signal?: AbortSignal, onProgress?: Function}} [opts]
   * @returns {Promise<{debt: object[], rates: object[]}>}
   */
  async function fetchInitial(opts = {}) {
    const report = opts.onProgress || (() => {});
    report('Reading the daily debt table...', 0.1);
    const debt = await fetchDebt(opts);
    report('Reading the average interest rates...', 0.6);
    const rates = await fetchRates(opts);
    report('Building the dashboard...', 1);
    return { debt, rates };
  }

  /**
   * Poll both tables for changes and report each result. A fresh reading that
   * revises the latest debt lands on the row it belongs to rather than adding
   * a second one; the grid keys on the date.
   *
   * @param {object} opts
   * @param {(result: object) => void} opts.onPoll called with each successful poll
   * @param {(error: Error) => void} [opts.onError] called when a poll fails
   * @param {number} [opts.intervalMs] how often to poll
   * @returns {{stop: Function, pollNow: Function}} a handle that stops the polling
   */
  function startPolling({ onPoll, onError, intervalMs = POLL_MS }) {
    let stopped = false;
    let timer = null;
    let polls = 0;
    const controller = new AbortController();

    const runOnce = async () => {
      if (stopped) return;
      polls += 1;
      try {
        const initial = await fetchInitial({ signal: controller.signal });
        if (!stopped) onPoll({ ...initial, fetchedAt: Date.now(), poll: polls });
      } catch (error) {
        if (!stopped && onError) onError(error);
      }
    };

    timer = setInterval(runOnce, intervalMs);

    return {
      stop() {
        stopped = true;
        clearInterval(timer);
        controller.abort();
      },
      pollNow: runOnce,
    };
  }

  /** Pack a debt row into the compact array form the snapshot stores. */
  function encodeDebt(row) {
    return DEBT_COLUMNS.map((col) => row[col]);
  }

  /** Unpack a compact snapshot array back into a debt row. */
  function decodeDebt(values) {
    const row = {};
    DEBT_COLUMNS.forEach((col, index) => {
      row[col] = values[index];
    });
    return row;
  }

  /** Pack a rates row into the compact array form the snapshot stores. */
  function encodeRate(row) {
    return RATES_COLUMNS.map((col) => row[col]);
  }

  /** Unpack a compact snapshot array back into a rates row. */
  function decodeRate(values) {
    const row = {};
    RATES_COLUMNS.forEach((col, index) => {
      row[col] = values[index];
    });
    return row;
  }

  /** Read the saved copy that ships with the demo. */
  async function readSnapshot() {
    const [debtValues, ratesValues, meta] = await Promise.all(
      ['debt', 'rates', 'meta'].map(async (name) => {
        const response = await fetch(`./data/snapshot/${name}.json`);
        if (!response.ok) throw new Error(`The saved copy is missing ${name}.json.`);
        return response.json();
      }),
    );
    return {
      debt: debtValues.map(decodeDebt),
      rates: ratesValues.map(decodeRate),
      meta: { ...meta, live: false },
    };
  }

  root.TreasuryDemo = Object.assign(root.TreasuryDemo || {}, {
    BASE,
    DEBT_PATH,
    RATES_PATH,
    DEBT_FIELDS,
    RATES_FIELDS,
    SECURITIES,
    POLL_MS,
    DEBT_COLUMNS,
    RATES_COLUMNS,
    buildDebtRows,
    buildRateRows,
    fetchDebt,
    fetchRates,
    fetchInitial,
    startPolling,
    encodeDebt,
    decodeDebt,
    encodeRate,
    decodeRate,
    readSnapshot,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
