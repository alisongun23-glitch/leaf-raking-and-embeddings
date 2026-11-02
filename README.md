# Rake Leaves Math

A simulator and algorithm lab for one raking puzzle. A field is sprinkled with points that slightly group together. One raker, who can only reach k and never teleports, has to gather every point into n piles of at least t points. Every stroke sweeps up whatever lies within l of its path.

The repo has three parts:

- **A browser app.** Every variable is a dial. You can watch algorithms play, play yourself, sweep a dial to see how work responds, and benchmark, on random fields, ten real-world point sets, or your own data file.
- **A headless benchmark and sweep** that run the same engine in Node.
- **Five starter algorithms**, tests, and the research behind it all:
  - [`reports/Raking points into piles.md`](reports/Raking%20points%20into%20piles.md)
  - [`research_notes/`](research_notes/)

No dependencies and no build step: plain JavaScript modules that run in the browser and in Node ≥ 20.

### Also in this repo: word-embedding research

[`experiments/kinship-pca/`](experiments/kinship-pca/) asks whether kinship terms (father, son, grandmother, ...) have a clean local geometry in GloVe 6B 300-d vectors, using PCA on small word sets with frequency-matched random-set nulls and permutation tests. Everything is seeded and re-runs in about 77 seconds. Predictions were declared before running:

- **Sex as PC1 held, decisively** (point-biserial r = 0.958 on a 15-term set). This rediscovers the known gender direction rather than finding something new.
- **Generation as the second axis did not hold as predicted.** PC2 is word frequency, and generation shows up on PC3 (rho = 0.78), barely above the random-set null maximum of 0.77. The write-up says plainly that this is weaker than hoped.

Start with [`results.md`](experiments/kinship-pca/results.md), and see [`reports/Local origins in word embeddings.md`](reports/Local%20origins%20in%20word%20embeddings.md) for the background.

```bash
npm run serve          # http://localhost:5173  (or: node scripts/serve.mjs --port 5173)
npm test               # node --test test/*.test.mjs
npm run bench          # baseline benchmark -> bench/out/<time>-baseline/
node bench/run.mjs bench/configs/slack.json --seeds 30
node bench/sweep.mjs --all 20 --seeds 1,2 --from 250 --to 500     # work against N: best function over 20 seeds
```

## The game

| You said | In the simulator |
|---|---|
| start on a point, take it to j | **Start** on any point. The first stroke rakes a neighbour into it, which makes it a pile. |
| choose a point at most k away | **Rake(o)**: any point or pile within **k** of where you stand. |
| everything within l of it and of the line to j comes too | Every loose point within **l** of the stroke segment (a capsule 2l wide) joins your pile. |
| select a point and move onto it | **Walk** to any point or pile within k. Nothing moves. |
| turn r into a new cluster | **Walk(r)**, then **Found**: r becomes a pile of 1. |
| move cluster j onto r | Standing on r, **Rake(pile j)**: a merge, which also sweeps the strip in between. |
| don't get stranded | Every loose point, and every pile still short of t, must stay connected to the raker through steps of at most k. Finished piles (≥ t) may be cut off; they are *frozen*. |
| n clusters of t | **Success** = no loose points left and exactly **n piles, each ≥ t**. |

### Facts the engine relies on

- **Fixed sites.** Piles only ever sit on original point sites. The reach graph over the N sites is therefore fixed for a given k, and play only deletes sites. Safety checks are exact, and lost reachability never comes back (whenever l ≤ k/2).
- **Stroke count.** strokes = N − n − (points swept up). With l = 0 every plan uses the same number of strokes.
- **Spare points.** There are s = N − n·t spare points. The excess over t, summed over all piles, can never exceed s. Running out is **starvation**: some pile can no longer reach t.

### Failure types

The engine reports:

- loose points cut off
- unfinished pile cut off
- starvation
- too many piles frozen
- stranded
- out of moves
- gave up (the algorithm found no move)
- illegal move (an algorithm bug)

Algorithms only play moves the safety check approves, so their failures are "gave up" or "out of moves".

### Rule toggles (dials, under *Rules*)

- **Push mode:** drag an object into any pile within k of it; the raker ends on that pile.
- **Free placement:** also allows any empty spot within k. Safety then becomes conservative.
- **Strokes also drag piles they cross.**
- **Move budget.**

### Costs and score

| Cost | Meaning |
|---|---|
| Strokes | Point rakes plus pile merges |
| Foundings, walks | Counted separately |
| Walking distance | Distance the raker walks |
| Stroke length | Σ stroke lengths |
| Work | Σ mass × straight-line distance to the destination pile, over everything moved |
| Time to rake | Seconds, reading field units as metres (see below) |
| Swept up | Points captured by capsules |

**Score** = w₁·strokes/(N − n) + w₂·walk/(walk bound) + w₃·work/(work bound). Lower is better; failed runs rank last. Defaults are w = (1, 0.2, 1): the walking bound is loose, so walking starts with a small weight.

**Time to rake** (`src/core/metrics.js`, dials under *Time to rake*):

time = walking distance ÷ walking speed + Σ stroke lengths ÷ raking speed + work × extra seconds per leaf·metre + strokes × seconds per stroke + new piles × seconds per pile

Defaults are 1.4 m/s, 1 m/s, 0.05 s, 2 s and 5 s. Changing them re-times runs without replaying them.

- **Where it shows:** the Watch header, a *Time to rake* card with the breakdown, benchmark tables and CSVs, and the Sweep tab's *Measure* choice.
- **Compute time:** how long the algorithm took to decide its moves. The benchmark and the Sweep tab report it as well. It is wall-clock time, so it is noisy when the computer is busy.

The certified lower bounds (`src/analysis/bounds.js`):

- **Strokes:** a packing bound.
- **Walking:** an area bound with radius k + l.
- **Work:** three bounds.
  - nearest-neighbour bound;
  - a Lagrangian bound for "n piles of at least t" (the headline; O(N²) per iteration, computed automatically for N ≤ 600 and on demand above that);
  - a transport bound to an algorithm's own final piles, which splits siting loss from routing loss in the benchmark CSV.

## The app

### Watch

Pick an algorithm. It plays in a background worker, then replays with play, step and scrub. By default it re-runs whenever a dial changes.

### Play

You are the raker. Hovering a target previews the stroke and the points it would sweep up:

- **green** = safe;
- **amber** = uses spare points;
- **red** = would cut something off or starve a pile, with the reason.

Controls:

- click = rake; shift-click = walk;
- **F** = found a pile; **U** = undo;
- drag = push, in push and free modes.

Unsafe moves are allowed, so you can see what breaks, then undo.

### Sweep

Steps one dial (leaf count N, piles n, pile size t, reach, rake width, grouping, scattered share or clumps) through a range and plays every value to the end, keeping the other dials as they are. **Measure** picks what is fitted and charted: work (the default, the only one with a lower bound), time to rake (minutes), compute time (ms), strokes, or walking distance.

**All seeds 1…S** (default 20) answers "how does work respond to this dial, and what function describes it?"

- **One line per seed**, the 10–90% band across seeds, and the best function drawn over them. "Each seed scaled to the typical level" divides out each field's own level, which leaves the shared shape and each seed's wiggles around it. Hover a line to pick out its seed; click to watch that run.
- **Which function fits best.** Nine candidates are tried: no effect, straight line, power law, exponential, logarithmic, reciprocal, quadratic, power law + constant, exponential + constant.
  - Each candidate is fitted to every seed at once, as work ≈ c_seed · f(x), on log work, so errors are relative and each seed keeps its own level c_seed.
  - They are compared by leave-one-seed-out cross-validation: fit the shape without one seed, fit only that seed's level, and measure the error. The simplest function within one standard error of the best is chosen.
  - The table also gives the share of each seed's own variation the shape explains, ΔAIC, the change over the range, and the elasticity, meaning the % change in work per 1% change in the dial.
- **How much each seed changes**: one dot per seed, comparing the first and last tenth of the range.
- Seeds' overall levels differ, and the summary says by how much (±% at 1 s.d.).

**Single seeds** give a closer look at up to five seeds:

- **Same field, more leaves.** When N is swept, each seed keeps its field and gains one leaf per step, so neighbouring values differ by exactly one leaf. With this off, every N draws a new field.
- **One function per seed.** Each seed's work curve is fitted as a power law, work ≈ a·N^b, by least squares on log work. The 95% interval for b uses a block bootstrap, because neighbouring values usually share a plan. When the algorithm reports regimes, each regime gets its own curve. For planned-sites the regimes are *planned* and *tree peel*, the fallback when it cannot build a plan.
- **Lower bound for every value.** This is the Lagrangian work bound, the least work any raker could do on that field. Work ÷ bound separates the field's difficulty from the algorithm's play.
- **Jumps.** Steps where work changes by at least 5% (a dial), each with what changed: the plan, where the piles ended up, the reach (when k follows M), or a redrawn field.
- Click any dot to watch that run. **Before / After** in the jump table opens the two runs on either side of a jump.

`node bench/sweep.mjs` runs the same sweep from the command line:

- options: `--path`, `--from`, `--to`, `--step`, `--measure work|time|compute|strokes|walk`, `--all S`, `--seeds 1,2|none`, `--algo`, `--redraw`, `--no-bound`, `--threshold`, `--config patch.json`, and `--reanalyse dir` to rebuild a report from saved runs;
- output: `points.csv`, `summary.md` (including the function comparison) and `sweep.json`, in `bench/out/<time>-sweep/`.

### Benchmark

Choose algorithms and seeds, and sweep one or two dials. Every algorithm plays the same seeded fields.

The results show:

- success rates with Wilson intervals;
- interquartile-mean costs with bootstrap intervals, including time to rake;
- Friedman and Holm-corrected Wilcoxon tests against the best algorithm;
- a performance profile;
- work-vs-strokes small multiples;
- CSV and JSON downloads.

### Dials

| Group | Dials |
|---|---|
| Field | point pattern: Thomas (exactly N), Matérn, fixed clumps + background, LGCP, uniform, five stress-test shapes, ten real data sets, or hand-placed / loaded points; N; width; height; clumps; grouping strength (pair-correlation excess g(0) − 1, with the field's measured Clark–Evans R shown next to it); scattered share; integer grid; keep the leaves when N changes; seed; **Load a data file…** and **Download points** |
| Goal | n; t |
| Raker | k (absolute or × M, where M = the field's minimum workable reach); l (absolute or × k) |
| Rules | the toggles above |
| Score | weights for strokes, walking and work |
| Algorithm | the algorithm and its own settings |
| Display | reach circle, capsule preview, reach links, "rake later" (articulation) points, cut-off points, the bottleneck gap, trail, clump members, pile sizes |

Other controls:

- **Share code:** one string holding every dial and the seed. It is also kept in the URL.
- **Replays:** export and load as JSON.
- **Moves CSV:** export the move-by-move table.

## Real data

Ten measured point sets ship with the app, plus six market fields (below). Pick them under **Point pattern → Real data** and **Point pattern → Market fields**.

| Set | Points | Shape | Source (licence) |
|---|---|---|---|
| Cholera deaths, London 1854 | 578 | one dense hotspot around the Broad Street pump, thinning along the streets; a few far outliers | John Snow's map, via R HistData (public-domain records) |
| Bramble canes in a 9 m plot | 823 | many small clumps around parent plants | Diggle (1983), via R boot |
| Earthquakes off Fiji since 1964 | 1000 | two curved bands along the trenches | Harvard PRIM-H, via R datasets |
| California earthquakes in 2023 | 974 | strings along faults plus dense aftershock clusters; large empty areas | USGS ComCat, M ≥ 2.5 (public domain) |
| Airfields in the United Kingdom | 1058 | a coastline-shaped region, dense in the south-east | OurAirports (public domain) |
| Street trees in Park Slope, Brooklyn | 1610 | points on straight lines: sidewalks of a street grid | NYC 2015 Street Tree Census (NYC Open Data) |
| Caveolae in a muscle fibre | 138 | evenly spaced, the opposite of clumping (Clark–Evans R ≈ 1.2) | Appleyard et al. (1985), via R boot |
| Old Faithful eruptions | 272 | two separate blobs (eruption length against waiting time) | Härdle (1991), via R datasets |
| Iris petals | 150 | a tight clump far from a long diagonal band | Anderson / Fisher (1936), via R datasets |
| Finds at a hunting stand, Alaska | 494 | dense work areas with a sparse scatter around them | Binford (1978), via R archdata |

**Market fields.** Six more sets are not places but markets: every point is an S&P 500 stock, placed by how its returns moved with every other stock's over one window.

| Set | Points | Window | Shape |
|---|---|---|---|
| Five years of daily returns | 467 | 2021-11-08 → 2026-10-30, 1250 days | a broad cloud of overlapping sector lobes; energy a separate tuft above it, utilities trailing off to the left |
| The calm year before Covid | 467 | 2019-02-22 → 2020-02-19, 250 days | a dense core with utilities and real estate stretched into a long sparse tail |
| The Covid crash year | 467 | 2020-01-07 → 2020-12-31, 250 days | a dense core of short overlapping lobes; energy and the rate-sensitive names on the rim |
| The 2022 rate rotation | 467 | 2021-10-05 → 2022-09-30, 250 days | an elongated cloud, tech at one end and utilities and staples at the other; energy split off below |
| The Covid quarter | 467 | 2020-01-15 → 2020-04-15, 63 days | one tight core with every sector piled together and a thin halo; a few names hang below |
| 5-minute bars | 439 | 2026-08-07 → 2026-10-30, 4620 bars | a main cloud with a long arm of tech names curving out to the left; energy below it, utilities a separate island |

How they are made: the distance between two stocks is the correlation distance of their daily (for the last set, 5-minute) log returns over the window, √(2(1 − ρ)), 0 for stocks that move together and √2 for unrelated ones, and classical MDS flattens the distance matrix to the plane. The plane keeps only 15–28 % of the distance variance: the sector shapes survive, but the market-wide shrink of a crash (every distance falling at once as correlations rise; the mean distance is 0.95 in 2020 against 1.22 in 2019) is mostly a change of scale, and every set is scaled to the same 100-unit field anyway, so it does not show in the 2-D field. Each set's Data card carries the full-dimension numbers instead (mean correlation, the longest and the mean edge of the spanning tree), and each module also stores every stock's sector (`groups` and `groupNames`) for a later overlay; the simulator ignores them. The coordinates are derived from Yahoo Finance adjusted closes (via yfinance) and GICS sectors, carry no price data, and are for personal and educational use. `node scripts/import-field-sets.mjs` regenerates the six modules from `experiments/asset-clusters/fields/`, which `experiments/asset-clusters/fields_export.py` writes.

How a set becomes a field:

- **Placement.** Each set is scaled so its longer side spans 100 field units, keeping its aspect ratio, with north or larger values at the top.
  - Longitude is shrunk by cos(latitude) first.
  - The two non-map sets (Old Faithful, iris) are stretched to 100 × 75, each axis on its own scale.
- **N picks a seeded random sample** of the set. Smaller N keeps a subset of larger N, and each seed picks a different sample. With every point used, the field is the same for every seed. The Sweep tab notices this and looks at that one field up close.
- **Duplicates.** Exact duplicate points would share one site, so they were nudged apart by less than the data's own precision. Each set's Data card says how many.
- **Data card.** It shows the set's description, units, source and licence.

**Your own data.**

- **Loading.** Use **Field → Load a data file…** with a CSV, TSV, semicolon- or space-separated table, with or without a header.
  - Columns named lon/lat (or longitude/latitude) are placed as degrees.
  - Otherwise x/y or east/north are used, or failing that the first two numeric columns.
  - If the two columns' ranges differ more than tenfold, the file is treated as a scatter plot: each axis is scaled on its own.
- **Limits.** Up to 5000 points are kept (a seeded sample beyond that).
- **Editing.** Loaded points become hand-placed points, so you can edit them.
- **Saving.** **Download points** saves the current field as x,y (field units, y up), ready to load again.

**Benchmark on real data** (`bench/configs/real-data.json`): random 150-point samples of each set, 10 seeds, 4 piles of at least 30, k = 1.5 M. The table gives runs finished and median work ÷ lower bound.

| Set | planned-sites | tree-peel | safe-greedy |
|---|---|---|---|
| Cholera deaths | 10/10, 1.04× | 10/10, 1.43× | 10/10, 1.75× |
| Bramble canes | 10/10, 1.11× | 10/10, 1.89× | 9/10, 2.37× |
| Fiji earthquakes | 10/10, 1.06× | 9/10, 1.67× | 9/10, 1.95× |
| California earthquakes | 10/10, 1.05× | 9/10, 1.68× | 4/10, 2.04× |
| UK airfields | 10/10, 1.04× | 10/10, 1.67× | 6/10, 2.00× |
| Park Slope trees | 10/10, 1.11× | 10/10, 1.95× | 10/10, 2.41× |
| Caveolae (evenly spaced) | 10/10, 1.03× | 10/10, 1.83× | **0/10** |
| Old Faithful | 10/10, 1.11× | 8/10, 1.97× | 2/10, 2.27× |
| Iris petals | 10/10, 1.03× | 10/10, 1.92× | 10/10, 1.89× |
| Hunting-stand finds | 10/10, 1.01× | 9/10, 1.71× | 9/10, 2.20× |

The shape matters to the local rules. safe-greedy grows piles from clumps, and the evenly spaced caveolae have none, so it fails on them every time. The planners hardly notice the shape.

**Refreshing and benchmarking.**

- `node scripts/fetch-datasets.mjs` downloads every set again from its source, cleans it, and rewrites `src/data/sets/`.
- `node scripts/import-field-sets.mjs` rewrites the six market fields (`src/data/sets/market-*.js`) from `experiments/asset-clusters/fields/`, without downloading anything.
- `node bench/run.mjs bench/configs/real-data.json` benchmarks every algorithm on 150-point samples of each set.

## Algorithms (`src/algos/`)

| Algorithm | Idea |
|---|---|
| `planned-sites` | n pile sites at group medians, each group holding at least t (min-size assignment). Groups are made connected in the reach graph and given exit trails owned by their parent group. When trails or repairs leave a group short of t, the siting is redone with a few points of margin. Each group is raked farthest-first along a shortest-path tree into its site. No stroke sweeps up a trail point before that trail's group is done, so the raker can always leave a finished group along its trail instead of needing the group's own relay piles as stepping stones. Once every group is done, groups with points left get a second pass. Whatever is still left goes to the tree peel. |
| `tree-peel` | Spanning-tree post-order: rake a finished node into its parent (or straight to the farthest ancestor within k), so nothing is ever cut off. Cuts are planned bottom-up so piles form low in the tree. |
| `safe-greedy` | Swarm-style local rules: grow the largest unfinished pile, merge unfinished piles early (never past t), and use your frontier move when a pile is down to its last loose neighbour. Pour into full piles only when everything unfinished is stuck; otherwise use relay piles and dissolve stuck piles. |
| `greedy-nearest` | Pull the nearest safe point until the pile holds t, then start another; merge at the end. The "what not to do" baseline. |
| `random-safe` | Random safe strokes. A floor to beat. |

### Benchmark snapshot

Default field: 300 points, slight grouping, 4 piles of at least 60 (60 spare). 20 seeds per setting, from `bench/configs/baseline.json`.

| k / M | l | planned-sites | tree-peel | safe-greedy | greedy-nearest |
|---|---|---|---|---|---|
| 1 | 0 – 4 | 15–20/20, work 1.5–1.7× bound | 16–20/20, 2.0–2.1× | 13–17/20, 2.6× | 0/20 |
| 1.5 | 0 – 4 | 18–20/20, 1.07–1.13× | 19–20/20, 1.9–2.2× | 19–20/20, 2.6× | 2–4/20 |
| 3 | 0 – 4 | **20/20, 1.02–1.04×** | 16–20/20, 1.7–2.0× | 12–19/20, 2.1–2.3× | 7–8/20 |

Spare points are the biggest difficulty dial (`bench/configs/slack.json`, k = 1.5 M):

| t | spare | planned-sites | tree-peel | safe-greedy |
|---|---|---|---|---|
| 45 | 120 | 20/20 at 1.06× the work bound | 20/20 at 2.14× | 14/20 at 2.52× |
| 70 | 20 | 18/20 at 1.12× | 10/20 at 2.02× | 13/20 at 2.77× |
| 75 | 0 | 1/20 | 1/20 | 6/20 |

Exact partitions (zero spare) are the open problem; careful local overshoot control currently beats planning there.

**About these numbers.** They are from after three fixes on 2026-10-31:

- **planned-sites, margin:** a group sited at exactly t could lose a leaf or two to an exit trail, and the run then fell back to the tree peel.
- **tree-peel:** when a stroke into the tree parent is refused, the tree peel now offers the point to a pile still short of t.
- **planned-sites, exit trails:** strokes could sweep up the points of a group's exit trail. The group's own relay piles were then its only way out, so they had to stay behind. At the end the tree peel dragged them, and everything they linked, across the field to its root.

Before the margin fix, planned-sites got:

- 1.6–2.0× the bound at k = 1.5 M;
- 1.11–1.14× at k = 3 M;
- 9/20 at t = 70.

Before the exit-trail fix, it got:

- 1.07–1.21× at k = 1.5 M;
- 17/20 at 1.22× at t = 70.
- On seed 13 of a 189 × 196 field (N = 2470, t = 187, l = 1.65), reach k = 1.10–1.12 M cost about 195k work, against 121k–131k on either side. That k now costs about 104k, and work falls smoothly as k grows. Across that seed's reach sweep (k = M to 3 M), 100 of 101 runs finish, where 88 did before.

### How work responds to one dial (sweep snapshot)

These are all-seeds sweeps (`bench/sweep.mjs --all 20 --seeds none`) with planned-sites, on seeds 1–20, rerun after the exit-trail fix. The dials are an 81 × 69 field with 40 clumps, grouping 3.35, 42% scattered, N = 206, n = 4, t = 49, k = 3 M, l = 1.5. One dial changes at a time. "Best fit" has the lowest error on a left-out seed; "simplest" is the plainest function about as good.

| Dial (range) | Best fit, typical seed | Simplest about as good | Change over the range (median seed, 10–90%) | Explains | Seeds' levels differ by |
|---|---|---|---|---|---|
| Leaves N (196–396) | 1550·e^(0.0032·N) | 297 + 12.9·N | +83% (+54% to +92%) | 91% | ±3% |
| Reach k/M (1–4) | 2890 + 2360·(k/M)^−3.31 | 2260 + 2040/(k/M) | −48% (−56% to −10%) | 45% | ±9% |
| Pile size t (20–51) | 2810 + 2.4e−16·e^(0.842·t) | no effect | +14% (+1% to +39%) | 40% | ±5% |
| Rake half-width l (0–5) | 2810·e^(0.054·l) | no effect | +23% (+1% to +51%) | 31% | ±11% |
| Clumps (2–60) | 3030 − 602·e^(−0.085·c) | 2440·c^0.056 | +20% (+6% to +35%) | 11% | ±3% |
| Grouping g(0) − 1 (0–8) | no effect | no effect | −4% (−8% to +30%) | 0% | ±6% |

How to read these results:

- **Leaves.** Work is close to proportional to N: about 13 work per added leaf, with elasticity 0.96. On the default dials (N 250–500) a straight line gives 1400 + 13.8·N.
- **Reach.** Work drops steeply from k = M to about 2 M, then hardly changes. Most of the drop is the planner becoming able to plan.
- **Pile size.** t barely matters until the spare leaves run out (t near N/n). Then work climbs, and some seeds fail.
- **Rake width.** A wider rake adds work, though with seeds scattering ±11%, "no effect" fits almost as well. Each stroke sweeps in neighbours, which are dragged to the current pile rather than the one planned for them.
- **Clumps and grouping.** These dials redraw the field at every value. The ±11–15% field-to-field noise is larger than any trend they cause.

Sweeping one seed at a time shows where single steps jump.

- **Before the margin fix**, one leaf could switch planned-sites between its plan and the tree peel, at about twice the work. On the default dials that happened for most N below 429.
- **After the margin fix**, every run from N = 200 up plans on these dials, and the largest one-leaf jump on seed 23829 fell from +95% to +26%.
- **After the exit-trail fix**, the jumps caused by leftovers handed to the tree peel are gone too. Seed 23829 has 2 jumps of 5% or more instead of 7: planned-sites starting to plan at N = 200, and one pile moving. Seed 23828 keeps +32% and −22% at N = 227–229, where a pile moves 22 and then 17 units.
- Older sweep reports call many of these steps "plan: broken → complete". That label was wrong: planned-sites called a run "broken" whenever it finished the whole field itself. Now "broken" means only that it handed over before every group was raked.

### Adding an algorithm

Create `src/algos/my-algo.js` and add it to `ALGORITHMS` in `src/algos/registry.js`. The UI builds its dials from `params`.

```js
export default {
  id: 'my-algo',
  name: 'My algorithm',
  blurb: 'One sentence for the UI.',
  params: { depth: { type: 'int', label: 'Look-ahead depth', min: 1, max: 6, step: 1, default: 2 } },
  create(game, params, rng, ctx) {
    return {
      start() { return 0; },                        // the site the raker starts on
      next() { return { type: 'rake', from: 17 }; }, // or walk / found, or null to give up
      stats() { return { regime: 'planned' }; },     // optional; sweeps fit each regime separately
    };
  },
};
```

What an algorithm can call on `game`:

- `preview(move)` → captures, cost deltas and a safety verdict;
- `previewFrom(site, move)` → the same, as if standing on `site`;
- `apply(move)` and `undo()` for look-ahead;
- `neighbors(i)`, `inReach(i, j)`, `piles()`, and the live counters in `game.c`.

`src/algos/util.js` has shortest walking routes (A*), the live spanning tree and a min-heap.

### Benchmark configs

`bench/configs/*.json`:

- `base`: a config patch;
- `grid`: dotted paths to value lists;
- `seeds`;
- `algorithms`;
- `lagrangian`.

Output: `bench/out/<time>-<name>/{runs.jsonl,summary.csv,summary.md}`.

## Layout

```
index.html, styles.css         the app shell
scripts/                       static server; fetch-datasets.mjs (downloads the real data sets), import-field-sets.mjs (the market fields)
src/core/                      rng, geometry, grid, game engine, safety verdicts, metrics, runner
src/gen/                       point patterns (Thomas exact-N sampler, Matérn, LGCP, shapes, real data) and clumpiness stats
src/data/                      the real data sets (sets/*.js), their placement in the field, and the file reader
src/analysis/                  minimum spanning tree and M, feasibility screens, lower bounds, siting,
                               instance builder, benchmark statistics and reports, sweeps and curve fitting
src/algos/                     the algorithms and their registry
src/ui/, src/worker/           the browser app and its background worker
bench/                         CLI benchmark, CLI sweep, configs
test/                          node:test suites (brute-force cross-checks, invariants, bounds vs exact optimum)
reports/, research_notes/      the literature review behind the design
```
