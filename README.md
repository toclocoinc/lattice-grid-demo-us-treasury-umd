# The US national debt, day by day

A dashboard of the United States public debt and average Treasury interest
rates, read from the Treasury's fiscal data API and drawn live, built on Lattice
Grid loaded by `<script>` tag: no npm install, no bundler, no build step, no
`type="module"`.

**[See it running](https://toclocoinc.github.io/lattice-grid-demo-us-treasury-umd/)**

| | |
| --- | --- |
| Grid on npm | [@toclocoinc/lattice-grid](https://www.npmjs.com/package/@toclocoinc/lattice-grid) |
| Grid repository | [toclocoinc/latticegrid](https://github.com/toclocoinc/latticegrid) |
| Product site | [latticegrid.dev](https://www.latticegrid.dev) |

It is two tables — daily "debt to the penny" back to 1993, and month-end
average interest rates for the marketable securities — with several views on
the debt table: headline statistic tiles, a KPI panel, four charts, and four
grids derived straight from the daily table. They all read the same stream, so
narrowing the daily table moves everything else with it.

The point of the demo is the analysis the grid itself maintains. The day-on-day
change and the 30-day average are shadow columns the grid computes; the monthly
aggregate, the monthly change, a statistical profile and a series summary are
derived grids whose rows come from the daily table rather than from a second
load; and the headline tiles read the grid so a figure and the table beneath it
can never disagree.

## How the grid gets onto the page

Six tags in `index.html`, and that is the whole of the library setup:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.65.0/lattice-grid.min.css">

<script src="https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.65.0/lattice-grid.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.65.0/modules/charts.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.65.0/modules/data-router.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.65.0/modules/kpi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.65.0/modules/tabs.min.js"></script>
```

Each file is the package's UMD build (`*.min.js`, beside the `*.esm.min.js`
the ESM edition imports) and leaves a global behind:

| File | Global | Used here for |
| --- | --- | --- |
| `lattice-grid.min.js` | `LatticeGrid` | `createGrid`, `createStat`, `setLicence` |
| `modules/charts.min.js` | extends `LatticeGrid` | `LatticeGrid.createChart` |
| `modules/data-router.min.js` | `LatticeGridDataRouter` | loaded as part of the set |
| `modules/kpi.min.js` | `LatticeGridKPI` | `createKPI` |
| `modules/tabs.min.js` | `LatticeGridTabs` | loaded as part of the set |

The charts module folds its exports into the core global rather than defining
one of its own, so its tag must come after the core's. The other three are
self-contained and can go in any order. `main.js` checks that every factory it
needs is actually there before it draws anything, so a tag that did not load
is reported as a sentence rather than as an error from inside the grid.

This demo reads two unrelated tables rather than routing one stream, and two of
its derived views need a `select` and a `statistics` projection that the tabs
module's `from` shorthand does not forward, so it builds its own small tab
strip. The tabs and data-router tags are still loaded, as the six-tag set is
what the page is checked against.

Every address names the exact release, `1.65.0`, and every tag carries the
`integrity` hash of the file it expects. The page cannot quietly pick up a
different build than the one it was checked against, and the browser refuses a
file that does not match. The hashes are the SHA-384 of the published files.

The demo's own code is four classic scripts, loaded in order after the
library: `src/licence.js`, `src/treasury-feed.js`, `src/dashboard.js`, `main.js`.
Each file wraps itself in a function and puts what it offers on one plain
object, `TreasuryDemo`, for the next file to read. `src/dashboard.js` is handed
the grid's factories as arguments and never touches a global itself.

## Running it

You need nothing but a browser and a way to serve the folder, because the page
fetches its data with `fetch()` and browsers will not do that from `file://`.
Any static server will do; one is included:

```
node tools/serve.mjs
```

That prints an address. Open it.

| Address | What you get |
| --- | --- |
| `/` | live, reading the Treasury fiscal data API and polling for changes |
| `/?source=snapshot` | the saved copy in `data/snapshot`, no API needed |

Running a copy on your own machine needs no licence key. Publishing it on a web
address does.

## What it shows

**The daily table drives everything.** The primary grid holds the whole
"debt to the penny" series since 1993, newest first. Its day-on-day change and
30-day average are shadow columns the grid maintains, not fields in the data;
the direction column is a pill that reads green or red, and the change columns
carry in-cell bars so a large move is visible before its number is read.

**Headline tiles that follow the table.** Three `createStat` tiles read the
grid directly: total public debt, debt held by the public, and the latest
Treasury bill rate. Each shows its change against a year-earlier baseline and
a tone from threshold bands; the total-debt tile also shows the grid's own
confidence interval, so a narrow view narrows the figure and its band together.

**A KPI panel over the same table.** Debt today, the change over 30 days, the
change over a year, and the trading days in view — all reduced from whatever
the table currently matches.

**Four charts.** A line of the daily debt, a line of the average rate for each
of the five marketable securities, an area of the debt held by the public, and
a histogram of the day-on-day change. Filter the table and every chart follows.

**Grids built from the grid.** Four derived grids take their rows from the
daily table: a monthly aggregate (sum, average and peak per month), a
month-over-month change, a statistical profile of the numeric columns, and a
series summary that reports the volatility of the daily debt — one row per
metric, with the annualised figure. They re-derive when the table moves.

**A feed that can fail.** If a poll cannot reach the Treasury the page says so
and keeps showing what it already had. If the API cannot be reached when the
page first opens, it shows the saved copy instead and says so under the title.

## The data

Everything comes from the US Treasury Fiscal Data API:

- <https://fiscaldata.treasury.gov/datasets/>

Two endpoints, both public, no key, and open cross-origin:

- `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny`
  — daily total public debt outstanding (and the part held by the public),
  back to April 1993. About 8,400 rows.
- `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates`
  — month-end average interest rates by security, back to 2001. The demo keeps
  the five marketable securities (Bills, Notes, Bonds, TIPS and floating-rate
  notes), because those are the clean, comparable line.

The data are published by the US Treasury and are free to use.

A few things worth knowing about the data:

- The field names are the API's own: `tot_pub_debt_out_amt` is the total public
  debt, `avg_interest_rate_amt` the average rate. Neither is a display name.
- Both endpoints page with `page[size]` and `page[number]`, JSON:API style; the
  debt table fits in a single request. The API returns the newest rows first,
  so the feed re-orders them oldest-first before computing the day-on-day
  change, which needs the reading the day before.
- Missing figures arrive as the string `"null"`, not as an absent field, and
  are read as null rather than as a number.
- The API refuses a request whose User-Agent says "HeadlessChrome", answering
  `500` with no cross-origin header. A real browser never sends that token, and
  the verification script asks for a real browser's User-Agent for the same
  reason; a headless run of the live page will otherwise fall back to the saved
  copy.
- The day-on-day change is computed in the feed, but the grid's own
  `periodOverPeriod` shadow does the same ordered delta; the `delta` and
  `deltaPercent` shadows track change from a baseline and read zero until the
  live poll revises a reading. The `rollingAvg` and `cumulativeToDate` shadows
  are the grid-maintained 30-day average and the running total.

## Files

```
index.html                page shell, and the six library tags
main.js                   works out where the data comes from, then starts
src/licence.js            the key for this demo's own published address
src/treasury-feed.js      the API: debt and rates, parsing, polling, snapshot
src/dashboard.js          the views: grids, tiles, KPI, charts, derived grids
styles.css                the page around the grid
tools/serve.mjs           a small static file server
tools/build-snapshot.mjs  save a real run into data/snapshot
tools/verify.mjs          open it in a real browser and check it
data/snapshot/            a saved run, so the demo works without the API
```

There is no `package.json` and no `node_modules`. The tools need Node 22 or
newer and nothing else.

The saved copy is two compact arrays of arrays — one value per column, in the
order `meta.json` documents — so eight thousand daily readings stay a
manageable download. The browser unpacks them with the same code that parses
the live API, so the two paths produce identical rows.

## Building the saved copy

```
node tools/build-snapshot.mjs
```

It reads both endpoints from the live API and writes the compact form to
`data/snapshot/`. Re-run it to refresh the copy.

## Checking it

```
node tools/verify.mjs         # open the page in a real browser and assert
node tools/verify.mjs --all   # also open the live API
```

`tools/verify.mjs` is not a smoke test. It first insists on how the library
arrived: no `type="module"` script anywhere on the page, five script tags
pointing at the pinned release on the CDN, each with an integrity hash, and
each leaving the global it documents. It then recomputes the headline figures
from the saved data and compares them with what the page is showing, checks the
derived grids hold the rows they should (monthly buckets, a profile, a series
summary with the volatility metric), compares the annualised volatility to an
independent recomputation, pushes a revised reading and insists the "since
first reading" shadow lights up without adding a row, narrows the table and
insists the tiles, the charts and the monthly grid all moved with it, and
finally blocks the Treasury API in the browser and insists the saved copy
appears with a notice saying why. The GitHub Pages workflow runs it before every
publish.

## Licence

The demo code is MIT. See `LICENSE`.

The debt and interest-rate data is from the US Treasury Fiscal Data API and is
published for free public use.

Lattice Grid itself is a separate commercial product with its own terms. It is
free to use on localhost, with no key and no watermark, so a copy of this
repository runs unrestricted on your own machine. This demo carries a key for
its own published address only, which is why you will find one in the source.
Keys for your own sites come from [latticegrid.dev](https://www.latticegrid.dev).

---
Built with [Lattice Grid](https://www.latticegrid.dev), a JavaScript data grid with a Data Router: one live feed keeps grids, charts, boards, Gantt and KPI tiles in step. [Documentation](https://www.latticegrid.dev/docs/) · [Demos](https://www.latticegrid.dev/demos/) · [Licence](https://www.latticegrid.dev/licence/)
