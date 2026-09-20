/**
 * The dashboard: two Treasury tables — daily debt and monthly interest rates —
 * and every view built on top of them.
 *
 * Nothing here fetches anything and nothing here reaches for the grid's
 * globals: every factory is handed in, so this file is the same whether the
 * library arrived by script tag, as it does here, or by import.
 *
 * The daily debt grid is the primary view. Its tiles, its KPI panel and its
 * charts all read it, so narrowing the table moves everything. Four further
 * views are derived from it — the monthly aggregate, the monthly change, a
 * statistical profile and a series summary — each its own grid whose rows come
 * from the debt grid rather than from a second load.
 *
 * A classic script: it reads the constants from `TreasuryDemo`, put there by
 * `treasury-feed.js`, and adds `buildDashboard` alongside them.
 */
(function (root) {
  'use strict';

  const { SECURITIES } = root.TreasuryDemo;

  /** Make an element with a class and optional text, the long way round. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** A dollar figure, compact for a headline. */
  function moneyCompact(value) {
    if (value == null || !Number.isFinite(value)) return '\u2014';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
  }

  /** A clock time, local to whoever is reading. */
  function clockText(ms) {
    return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /** A `YYYY-MM-DD` string, `days` days later (negative for earlier). */
  function addDays(date, days) {
    const at = new Date(`${date}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + days);
    return at.toISOString().slice(0, 10);
  }

  /** The plain data objects a grid is currently showing, in display order. */
  function plainRows(grid) {
    const out = [];
    if (grid && grid.rows && grid.rows.forEach) {
      grid.rows.forEach((row) => {
        if (row && !row.group && row.data) out.push(row.data);
      });
    }
    return out;
  }

  /** The row with the latest date in a set. */
  function latestRow(rows) {
    let best = null;
    for (const row of rows) {
      if (row && row.date && (!best || row.date > best.date)) best = row;
    }
    return best;
  }

  /** The row whose date is the latest at or before `date`. */
  function rowOnOrBefore(rows, date) {
    let best = null;
    for (const row of rows) {
      if (row && row.date && row.date <= date && (!best || row.date > best.date)) best = row;
    }
    return best;
  }

  /** A currency column format. */
  function usd(decimals) {
    return { style: 'currency', currency: 'USD', decimals: decimals == null ? 0 : decimals };
  }

  /* ------------------------------------------------------------------ */
  /* Columns                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * The daily debt columns.
   *
   * The day-over-day movement is the grid's own `periodOverPeriod` shadow
   * (`change`) and its 30-day `rollingAvg` shadow; the `direction` pill and the
   * `changePct` percentage are plain fields the feed computed, because a pill
   * needs a word and a lag-1 percentage is not a shadow kind. The `delta` and
   * `deltaPct` columns are the "since the first reading" kinds, kept hidden:
   * they read zero until a reading is revised, which is what the live poll
   * does when the Treasury corrects the latest figure.
   *
   * @param {object} range the symmetric bar ranges computed from the data
   * @returns {object[]} the column definitions
   */
  function debtColumns(range) {
    return [
      {
        id: 'date',
        field: 'date',
        title: 'Date',
        type: 'date',
        format: { type: 'date', pattern: 'd MMM yyyy' },
        filter: { type: 'date' },
        layout: { width: 120, pin: 'start' },
      },
      {
        id: 'debt',
        field: 'debt',
        title: 'Total public debt',
        type: 'number',
        format: usd(0),
        total: 'last',
        filter: { type: 'number' },
        layout: { width: 200 },
      },
      {
        id: 'change',
        title: 'Day-over-day',
        type: 'number',
        shadow: { kind: 'periodOverPeriod', of: 'debt', orderBy: 'date' },
        format: { ...usd(0), signed: true },
        cell: { decoration: { type: 'bar', min: range.change.min, max: range.change.max, origin: 0 } },
        layout: { width: 160 },
      },
      {
        id: 'direction',
        field: 'direction',
        title: 'Direction',
        cell: {
          decoration: 'pill',
          variant: {
            when: [
              { op: 'eq', value: 'up', use: 'danger' },
              { op: 'eq', value: 'down', use: 'success' },
            ],
            default: 'neutral',
          },
        },
        filter: { type: 'set' },
        layout: { width: 110 },
      },
      {
        id: 'changePct',
        field: 'changePct',
        title: 'Change %',
        type: 'number',
        format: { type: 'number', decimals: 3, suffix: '%', signed: true },
        cell: { decoration: { type: 'bar', min: range.pct.min, max: range.pct.max, origin: 0 } },
        layout: { width: 130 },
      },
      {
        id: 'rollingAvg',
        title: '30-day average',
        type: 'number',
        shadow: { kind: 'rollingAvg', of: 'debt', orderBy: 'date', window: { kind: 'count', span: 30 } },
        format: usd(0),
        layout: { width: 190 },
      },
      {
        id: 'heldPublic',
        field: 'heldPublic',
        title: 'Held by the public',
        type: 'number',
        format: usd(0),
        layout: { width: 190, hidden: true },
      },
      {
        id: 'delta',
        title: 'vs first reading',
        type: 'number',
        shadow: { kind: 'delta', of: 'debt' },
        format: { ...usd(0), signed: true },
        layout: { hidden: true },
      },
      {
        id: 'deltaPct',
        title: 'vs first reading %',
        type: 'number',
        shadow: { kind: 'deltaPercent', of: 'debt' },
        format: { type: 'number', decimals: 3, suffix: '%', signed: true },
        layout: { hidden: true },
      },
    ];
  }

  /** The interest rate columns: a two-line security cell and a barred rate. */
  function rateColumns() {
    return [
      {
        id: 'security',
        field: 'security',
        title: 'Security',
        cell: {
          render: 'twoline',
          props: { secondary: (p) => `${Number(p.data.rate).toFixed(3)}%` },
        },
        filter: { type: 'set' },
        layout: { width: 320 },
      },
      {
        id: 'date',
        field: 'date',
        title: 'Month',
        type: 'date',
        format: { type: 'date', pattern: 'MMM yyyy' },
        filter: { type: 'date' },
        layout: { width: 120 },
      },
      {
        id: 'rate',
        field: 'rate',
        title: 'Average rate',
        type: 'number',
        format: { type: 'number', decimals: 3, suffix: '%' },
        cell: { decoration: 'bar', min: 0, max: 8 },
        layout: { width: 200 },
      },
    ];
  }

  /** The monthly aggregate columns. */
  function monthlyColumns() {
    return [
      { id: 'date', field: 'date', title: 'Month', type: 'date', format: { type: 'date', pattern: 'MMM yyyy' }, layout: { width: 120 } },
      { id: 'total', field: 'total', title: 'Sum of daily debt', type: 'number', format: usd(0), layout: { width: 200 } },
      { id: 'avg', field: 'avg', title: 'Average daily debt', type: 'number', format: usd(0), layout: { width: 200 } },
      { id: 'peak', field: 'peak', title: 'Peak (month end)', type: 'number', format: usd(0), layout: { width: 200 } },
    ];
  }

  /** The monthly change columns: the month-end peak and its lag-1 change. */
  function changeColumns() {
    return [
      { id: 'date', field: 'date', title: 'Month', type: 'date', format: { type: 'date', pattern: 'MMM yyyy' }, layout: { width: 120 } },
      { id: 'peak', field: 'peak', title: 'Peak debt', type: 'number', format: usd(0), layout: { width: 200 } },
      {
        id: 'mom',
        title: 'Month over month',
        type: 'number',
        shadow: { kind: 'periodOverPeriod', of: 'peak', orderBy: 'date' },
        format: { ...usd(0), signed: true },
        cell: { decoration: { type: 'bar', min: -1.5e12, max: 1.5e12, origin: 0 } },
        layout: { width: 200 },
      },
    ];
  }

  /** The profile columns: one row per profiled column. */
  function profileColumns() {
    return [
      { id: 'column', field: 'column', title: 'Column', layout: { width: 160 } },
      { id: 'rows', field: 'rows', title: 'Rows', type: 'number', layout: { width: 90 } },
      { id: 'present', field: 'present', title: 'Present', type: 'number', layout: { width: 90 } },
      { id: 'distinct', field: 'distinct', title: 'Distinct', type: 'number', layout: { width: 90 } },
      { id: 'min', field: 'min', title: 'Min', type: 'number', format: usd(0), layout: { width: 190 } },
      { id: 'max', field: 'max', title: 'Max', type: 'number', format: usd(0), layout: { width: 190 } },
      { id: 'mean', field: 'mean', title: 'Mean', type: 'number', format: usd(0), layout: { width: 190 } },
      { id: 'median', field: 'median', title: 'Median', type: 'number', format: usd(0), layout: { width: 190 } },
      { id: 'stddev', field: 'stddev', title: 'Std dev', type: 'number', format: usd(0), layout: { width: 190 } },
      { id: 'outliers', field: 'outliers', title: 'Outliers', type: 'number', layout: { width: 90 } },
    ];
  }

  /** The series-summary columns: one row per metric. */
  function seriesColumns() {
    return [
      { id: 'metric', field: 'metric', title: 'Metric', layout: { width: 220 } },
      { id: 'value', field: 'value', title: 'Value', type: 'number', layout: { width: 240 } },
      { id: 'n', field: 'n', title: 'n', type: 'number', layout: { width: 90 } },
    ];
  }

  /** The shared grid settings the tables use. */
  function baseGridConfig(title, extra) {
    return Object.assign(
      {
        rowKey: 'id',
        theme: 'light',
        density: 'compact',
        stripedRows: true,
        columnMenu: true,
        statusBar: true,
        find: true,
        grandTotalRow: 'bottom',
        toolPanel: { side: 'right', panels: ['filters', 'columns', 'formatting'] },
        title,
      },
      extra || {},
    );
  }

  /* ------------------------------------------------------------------ */
  /* A small tab strip                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * A minimal accessible tab strip. This demo builds its own rather than using
   * the tabs module because two of the derived views need a `select` and a
   * `statistics` projection, which the module's `from` shorthand does not
   * forward; the grids are created directly and swapped in and out of sight.
   */
  function tabStrip(host, tabs) {
    const bar = el('div', 'tab-bar');
    bar.setAttribute('role', 'tablist');
    const panes = el('div', 'tab-panes');
    host.append(bar, panes);

    const buttons = {};
    const panels = {};
    for (const tab of tabs) {
      const btn = el('button', 'tab-btn', tab.label);
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.addEventListener('click', () => activate(tab.id));
      bar.append(btn);
      buttons[tab.id] = btn;

      const panel = el('div', 'tab-panel');
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = true;
      panes.append(panel);
      panels[tab.id] = panel;
    }

    let activeId = null;
    function activate(id) {
      if (!buttons[id] || activeId === id) return;
      activeId = id;
      for (const key of Object.keys(buttons)) {
        const on = key === id;
        buttons[key].classList.toggle('on', on);
        buttons[key].setAttribute('aria-selected', String(on));
        panels[key].hidden = !on;
      }
    }
    activate(tabs[0].id);

    return { activate, panel: (id) => panels[id], activeId: () => activeId, bar };
  }

  /* ------------------------------------------------------------------ */
  /* The dashboard                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Build the whole page into `host`.
   *
   * @param {object} options
   * @param {HTMLElement} options.root where the dashboard is drawn
   * @param {Function} options.createGrid the grid factory
   * @param {Function} options.createStat the statistic-tile factory
   * @param {Function} options.createChart the charts module's factory
   * @param {Function} options.createKPI the KPI module's factory
   * @param {object[]} options.debt the daily debt rows
   * @param {object[]} options.rates the interest rate rows
   * @param {object} options.meta where the data came from, and when
   * @returns {object} the pieces that were built, for a caller that wants them
   */
  function buildDashboard({ root: host, createGrid, createStat, createChart, createKPI, debt, rates, meta }) {
    host.textContent = '';

    const built = {
      debtGrid: null,
      ratesGrid: null,
      monthlyGrid: null,
      monthlyChangeGrid: null,
      profileGrid: null,
      seriesGrid: null,
      stats: [],
      kpi: null,
      charts: [],
      tabs: null,
      status: { lastPoll: null, lastError: null, polls: 0, revisions: 0 },
    };

    /* ---------------- the masthead ---------------- */

    const header = el('header', 'head');
    const heading = el('div', 'head-text');
    heading.append(el('h1', null, 'The US national debt, day by day'));
    heading.append(
      el(
        'p',
        'lede',
        'Total public debt outstanding and average Treasury interest rates, read from the US Treasury\u2019s ' +
          'fiscal data API and drawn live. The daily debt table holds the whole series back to 1993; the rates ' +
          'table holds the month-end average for the five marketable securities.',
      ),
    );
    if (meta.fellBack) {
      heading.append(
        el(
          'p',
          'notice',
          'The Treasury fiscal data API could not be reached, so this is the saved copy. Reloading the page will try again.',
        ),
      );
    }
    header.append(heading);

    const provenance = el('div', 'head-note');
    const modePill = el('span', 'pill', meta.live ? 'Live' : 'Saved copy');
    const liveDot = el('span', 'dot');
    if (meta.live) modePill.prepend(liveDot);
    const freshness = el('span', 'freshness', 'Waiting for the first update...');
    provenance.append(modePill, freshness);
    header.append(provenance);
    host.append(header);

    /* ---------------- the grids ---------------- */

    const chartHost = el('section', 'chart-wrap');
    chartHost.setAttribute('aria-label', 'Charts');
    const chartBoxes = [];
    for (let i = 0; i < 4; i += 1) {
      const box = el('div', 'chart-box');
      chartHost.append(box);
      chartBoxes.push(box);
    }

    /* The primary daily debt grid, built first so the derived views can read
       it. It is mounted into the first tab's panel below. */
    const debtPane = el('div', 'grid-pane');
    const debtGrid = createGrid(debtPane, baseGridConfig('Total public debt, daily (since 1993)', {
      columns: debtColumns(rangeFor(debt)),
      sort: [{ col: 'date', dir: 'desc' }],
    }));
    built.debtGrid = debtGrid;

    /* The interest rate grid, mounted into the rates tab below. */
    const ratesPane = el('div', 'grid-pane');
    const ratesGrid = createGrid(ratesPane, baseGridConfig('Average interest rates by security, month end', {
      columns: rateColumns(),
      density: 'comfortable',
      grandTotalRow: false,
      sort: [{ col: 'date', dir: 'desc' }, { col: 'security', dir: 'asc' }],
    }));
    built.ratesGrid = ratesGrid;

    /* The derived views. Each takes its rows from the debt grid (or, for the
       monthly change, from the monthly grid), so a filter on the debt table
       re-derives them all. */
    const monthlyGrid = createGrid(el('div', 'grid-pane'), baseGridConfig('Debt aggregated to months', {
      columns: monthlyColumns(),
      grandTotalRow: false,
      source: {
        mode: 'derived',
        from: debtGrid,
        groupBy: 'date',
        bucket: { of: 'date', by: 'month' },
        select: {
          total: { of: 'debt', fn: 'sum' },
          avg: { of: 'debt', fn: 'avg' },
          peak: { of: 'debt', fn: 'max' },
        },
        sort: [{ col: 'date', dir: 'desc' }],
      },
    }));
    built.monthlyGrid = monthlyGrid;

    const monthlyChangeGrid = createGrid(el('div', 'grid-pane'), baseGridConfig('Month-over-month change in debt', {
      columns: changeColumns(),
      grandTotalRow: false,
      source: { mode: 'derived', from: monthlyGrid, follow: 'all', sort: [{ col: 'date', dir: 'desc' }] },
    }));
    built.monthlyChangeGrid = monthlyChangeGrid;

    const profileGrid = createGrid(el('div', 'grid-pane'), baseGridConfig('Profile of the daily debt', {
      columns: profileColumns(),
      grandTotalRow: false,
      source: { mode: 'derived', from: debtGrid, profile: ['debt', 'heldPublic'] },
    }));
    built.profileGrid = profileGrid;

    const seriesGrid = createGrid(el('div', 'grid-pane'), baseGridConfig('The daily debt series, as one row per metric', {
      columns: seriesColumns(),
      grandTotalRow: false,
      source: {
        mode: 'derived',
        from: debtGrid,
        statistics: { fn: 'series', of: 'debt', by: 'date', periodsPerYear: 252 },
      },
    }));
    built.seriesGrid = seriesGrid;

    /* ---------------- the tabs ---------------- */

    const tabsHost = el('section', 'tabs-host');
    const tabs = tabStrip(tabsHost, [
      { id: 'debt', label: 'Daily debt' },
      { id: 'monthly', label: 'Monthly debt' },
      { id: 'change', label: 'Monthly change' },
      { id: 'rates', label: 'Interest rates' },
      { id: 'profile', label: 'Profile' },
      { id: 'series', label: 'Series stats' },
    ]);
    built.tabs = tabs;
    tabs.panel('debt').append(debtPane);
    tabs.panel('monthly').append(monthlyGrid.element);
    tabs.panel('change').append(monthlyChangeGrid.element);
    tabs.panel('rates').append(ratesPane);
    tabs.panel('profile').append(profileGrid.element);
    tabs.panel('series').append(seriesGrid.element);

    /* ---------------- the data ---------------- */

    debtGrid.rows.load(debt);
    ratesGrid.rows.load(rates);

    /* ---------------- the stat tiles ---------------- */

    const statStrip = el('section', 'stat-strip');
    statStrip.setAttribute('aria-label', 'Headline figures');
    host.append(statStrip);

    const statTile = () => el('div', 'stat-box');

    /** The latest debt in the grid's current view. */
    function latestDebt(grid) {
      const latest = latestRow(plainRows(grid));
      return latest ? latest.debt : null;
    }
    /** The debt roughly `days` before the latest reading in view. */
    function debtBefore(grid, days) {
      const rows = plainRows(grid);
      const latest = latestRow(rows);
      if (!latest) return null;
      const before = rowOnOrBefore(rows, addDays(latest.date, -days));
      return before ? before.debt : null;
    }
    /** The latest Treasury bill rate in the rates grid's current view. */
    function latestBillRate(grid) {
      const bills = plainRows(grid).filter((row) => row.security === SECURITIES[0]);
      const latest = latestRow(bills);
      return latest ? latest.rate : null;
    }
    /** The Treasury bill rate roughly a year before the latest reading. */
    function billRateBefore(grid, days) {
      const bills = plainRows(grid).filter((row) => row.security === SECURITIES[0]);
      const latest = latestRow(bills);
      if (!latest) return null;
      const before = rowOnOrBefore(bills, addDays(latest.date, -days));
      return before ? before.rate : null;
    }

    const debtTile = statTile();
    const heldTile = statTile();
    const billTile = statTile();
    statStrip.append(debtTile, heldTile, billTile);

    built.stats.push(
      createStat({
        grid: debtGrid,
        container: debtTile,
        title: 'Total public debt',
        value: (g) => latestDebt(g),
        format: (v) => moneyCompact(v),
        baseline: (g) => debtBefore(g, 365),
        goodWhen: 'down',
        bands: { good: 25e12, warn: 35e12, direction: 'down' },
        interval: (v, g) => g.statistics.interval('debt'),
        footer: (v, g) => {
          const latest = latestRow(plainRows(g));
          return latest ? `Latest reading, ${latest.date}. Band is the 95% confidence interval of the daily series in view.` : '';
        },
      }),
      createStat({
        grid: debtGrid,
        container: heldTile,
        title: 'Debt held by the public',
        value: (g) => {
          const latest = latestRow(plainRows(g));
          return latest ? latest.heldPublic : null;
        },
        format: (v) => moneyCompact(v),
        baseline: (g) => {
          const rows = plainRows(g);
          const latest = latestRow(rows);
          if (!latest) return null;
          const before = rowOnOrBefore(rows, addDays(latest.date, -365));
          return before ? before.heldPublic : null;
        },
        goodWhen: 'down',
      }),
      createStat({
        grid: ratesGrid,
        container: billTile,
        title: 'Treasury bill rate',
        value: (g) => latestBillRate(g),
        format: (v) => (Number.isFinite(v) ? `${Number(v).toFixed(3)}%` : '\u2014'),
        baseline: (g) => billRateBefore(g, 365),
        goodWhen: 'down',
        footer: 'Average interest rate on outstanding Treasury bills, latest month end.',
      }),
    );

    /* ---------------- the KPI panel ---------------- */

    const kpiStrip = el('section', 'kpi-strip');
    kpiStrip.setAttribute('aria-label', 'Figures that follow the table');
    const panelHost = el('div', 'kpi-panel');
    const seriesTile = el('div', 'kpi-named');
    const seriesValue = el('div', 'kpi-named-value', 'No data');
    const seriesLabel = el('div', 'kpi-named-label', 'Annualised volatility of daily changes');
    seriesTile.append(seriesValue, seriesLabel);
    kpiStrip.append(panelHost, seriesTile);
    host.append(kpiStrip);

    const kpi = createKPI(panelHost, {
      grid: debtGrid,
      rowKey: 'id',
      fields: ['debt', 'date'],
      columns: 4,
      ariaLabel: 'Figures that follow the table',
      tiles: [
        {
          id: 'debtNow',
          label: 'Debt, latest (USD)',
          aggregation: 'custom',
          format: { type: 'compact', decimals: 2 },
          compute: (rows) => {
            const latest = latestRow(rows);
            return latest ? latest.debt : null;
          },
        },
        {
          id: 'change30',
          label: 'Change, 30 days (USD)',
          aggregation: 'custom',
          format: { type: 'compact', decimals: 2 },
          compute: (rows) => {
            const latest = latestRow(rows);
            if (!latest) return null;
            const before = rowOnOrBefore(rows, addDays(latest.date, -30));
            return before ? latest.debt - before.debt : null;
          },
        },
        {
          id: 'change365',
          label: 'Change, 1 year (USD)',
          aggregation: 'custom',
          format: { type: 'compact', decimals: 2 },
          compute: (rows) => {
            const latest = latestRow(rows);
            if (!latest) return null;
            const before = rowOnOrBefore(rows, addDays(latest.date, -365));
            return before ? latest.debt - before.debt : null;
          },
        },
        { id: 'days', label: 'Trading days in view', aggregation: 'count', format: 'number' },
      ],
    });
    built.kpi = kpi;

    /* The volatility readout, from the grid's own series statistics. */
    function refreshSeriesTile() {
      const summary = debtGrid.statistics.series('debt', { by: 'date', periodsPerYear: 252 });
      if (summary && Number.isFinite(summary.annualisedVolatility)) {
        seriesValue.textContent = `${(summary.annualisedVolatility * 100).toFixed(2)}%`;
        seriesLabel.textContent = `Annualised volatility of daily debt changes (${summary.n} readings)`;
      } else {
        seriesValue.textContent = 'No data';
        seriesLabel.textContent = 'Annualised volatility of daily changes';
      }
    }
    debtGrid.on('model:changed', () => refreshSeriesTile());
    refreshSeriesTile();

    /* ---------------- the charts ---------------- */

    const chartSpecs = [
      {
        type: 'line',
        x: 'date',
        y: 'debt',
        title: 'Total public debt, daily',
        axis: { x: 'Date', y: 'Debt' },
        legend: false,
      },
      {
        type: 'line',
        x: 'date',
        y: 'rate',
        series: 'security',
        title: 'Average interest rate by security',
        axis: { x: 'Month', y: 'Average rate (%)' },
      },
      {
        type: 'area',
        x: 'date',
        y: 'heldPublic',
        title: 'Debt held by the public',
        axis: { x: 'Date', y: 'Debt' },
        legend: false,
      },
      {
        type: 'histogram',
        y: 'changePct',
        buckets: 30,
        title: 'Day-over-day change, %',
        axis: { x: 'Change (%)', y: 'Days' },
        legend: false,
      },
    ];

    const chartGrids = [debtGrid, ratesGrid, debtGrid, debtGrid];
    chartSpecs.forEach((spec, index) => {
      try {
        built.charts.push(createChart({ grid: chartGrids[index], container: chartBoxes[index], ...spec }));
      } catch (error) {
        chartBoxes[index].append(el('p', 'chart-error', `This chart could not be drawn: ${error.message}`));
        console.error('[us treasury demo] chart', spec.type, error);
      }
    });
    host.append(chartHost);

    /* ---------------- the controls ---------------- */

    const actions = el('div', 'actions');
    host.append(actions);

    host.append(tabsHost);

    const recentButton = el('button', 'action toggle', 'Last 12 months only');
    recentButton.type = 'button';
    recentButton.setAttribute('aria-pressed', 'false');
    recentButton.addEventListener('click', () => {
      const on = recentButton.getAttribute('aria-pressed') === 'true';
      const cutoff = addDays(new Date().toISOString().slice(0, 10), -365);
      /* A named row predicate: registering it activates it, and removing it by
         name leaves any other filter the reader has set untouched. */
      debtGrid.filters.where('recent', on ? null : (row) => row.date >= cutoff);
      recentButton.setAttribute('aria-pressed', String(!on));
      recentButton.classList.toggle('on', !on);
    });
    actions.append(el('span', 'actions-label', 'The daily debt table drives everything else.'));
    actions.append(recentButton);
    built.recentButton = recentButton;

    /* ---------------- the live readout ---------------- */

    function setFreshness() {
      if (!meta.live) {
        const saved = new Date(meta.fetchedAt).toLocaleString('en-GB');
        freshness.textContent = `A saved copy of the Treasury fiscal data, taken on ${saved}.`;
        freshness.className = 'freshness';
        return;
      }
      if (built.status.lastError) {
        freshness.textContent = built.status.lastPoll
          ? `Could not reach the API. Still showing what arrived at ${clockText(built.status.lastPoll)}.`
          : 'Could not reach the API.';
        freshness.className = 'freshness failed';
        return;
      }
      if (!built.status.lastPoll) {
        freshness.textContent = 'Waiting for the first update...';
        freshness.className = 'freshness';
        return;
      }
      freshness.textContent = `Updated ${clockText(built.status.lastPoll)}. ${built.status.revisions} revisions since the page opened.`;
      freshness.className = 'freshness';
    }
    built.setFreshness = setFreshness;

    built.onPoll = (result) => {
      built.status.lastPoll = result.fetchedAt || Date.now();
      built.status.lastError = null;
      built.status.polls += 1;
      liveDot.classList.add('beat');
      setTimeout(() => liveDot.classList.remove('beat'), 900);
      if (result.debt && result.debt.length) {
        debtGrid.rows.load(result.debt);
        built.status.revisions += 1;
      }
      if (result.rates && result.rates.length) ratesGrid.rows.load(result.rates);
      setFreshness();
    };

    built.onPollError = (error) => {
      built.status.lastError = String((error && error.message) || error);
      setFreshness();
      console.warn('[us treasury demo] a poll failed:', built.status.lastError);
    };

    /** Push rows through the same path a poll uses, for the verification script. */
    built.ingest = (incoming) => {
      if (!incoming || !incoming.length) return 0;
      debtGrid.rows.apply({ update: incoming });
      return incoming.length;
    };

    setFreshness();

    /* ---------------- the footer ---------------- */

    const footer = el('footer', 'foot');
    const line = el('p', null, 'Data from the ');
    const link = el('a', null, 'US Treasury Fiscal Data API');
    link.href = 'https://fiscaldata.treasury.gov/datasets/';
    link.rel = 'noopener';
    line.append(link);
    line.append(
      document.createTextNode(
        '. The figures are as published by the Treasury and are free to use. ' +
          'Debt is total public debt outstanding, published daily since 1993; the interest rates are ' +
          'month-end averages across outstanding marketable securities.',
      ),
    );
    footer.append(line);
    host.append(footer);

    built.destroy = () => {
      for (const chart of built.charts) chart.destroy();
      for (const stat of built.stats) stat.destroy();
      kpi.destroy();
      debtGrid.destroy();
      ratesGrid.destroy();
      monthlyGrid.destroy();
      monthlyChangeGrid.destroy();
      profileGrid.destroy();
      seriesGrid.destroy();
    };

    return built;
  }

  /** The symmetric bar ranges for the day-over-day columns, from the data. */
  function rangeFor(debt) {
    let change = 0;
    let pct = 0;
    for (let i = 1; i < debt.length; i += 1) {
      change = Math.max(change, Math.abs(debt[i].debt - debt[i - 1].debt));
    }
    for (const row of debt) {
      if (row.changePct != null) pct = Math.max(pct, Math.abs(row.changePct));
    }
    return {
      change: { min: -change, max: change },
      pct: { min: -pct, max: pct },
    };
  }

  root.TreasuryDemo.buildDashboard = buildDashboard;
})(typeof globalThis !== 'undefined' ? globalThis : window);
