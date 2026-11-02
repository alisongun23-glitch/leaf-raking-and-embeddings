# Clustered spatial point processes for instance generation, and connectivity of the k-disk graph (leaf-raking simulator)

Conventions: W is the window, with area A (the unit square unless stated). N is the number of points, λ = N/A is the mean intensity, and k is the agent's reach. G_k is the graph joining two points when their distance is ≤ k. M is the longest edge of the Euclidean minimum spanning tree (EMST).

Tags:
- **[own derivation]**: my mathematics, not taken from a source.
- **[own simulation]**: a seeded Monte Carlo run I did in Node v26 (mulberry32 RNG, unit square, exactly N points). The scripts `sim.mjs`, `diag.mjs` and `calib.mjs` are saved in `sims/` next to these notes (copied there from the session scratchpad). The essential code is reproduced below.
- **[unverified]**: from memory, or not confirmed by a source fetched in this session.

## 1. Definitions and exact simulation algorithms (Thomas, Matérn, Neyman–Scott, Gaussian mixture + uniform background, LGCP), edge effects, and getting exactly N points

### Takeaway
All five models work the same way: draw a random intensity, then draw Poisson or i.i.d. points from it. Each is easy to code from scratch:
- Poisson(κ) parents are placed in a window expanded by 4σ (Thomas) or by R (Matérn).
- Each parent gets Poisson(μ) offspring, displaced by a Gaussian or a uniform-disc kernel.
- The mean intensity is κμ.

To get exactly N points, treat Thomas (or any Neyman–Scott process with Poisson offspring) as a Cox process:
1. Rejection-sample the parent configuration, accepting with probability (Λ(W)/N)^N·e^{N−Λ(W)}.
2. Draw N i.i.d. points from the normalised driving intensity.

This is exact. The acceptance rate is about 1/√(1+μ), which my simulation confirmed. Plain "simulate until the count equals N" costs about 35× more at N = 200 with μ = 8.

### Cited Findings
**Thomas process (spatstat `rThomas`)**
- Signature: `rThomas(kappa, scale, mu, win = square(1), nsim = 1, drop = TRUE, ..., algorithm = c("BKBC","naive"), nonempty = TRUE, poisthresh = 1e-6, expand = 4*scale, saveparents = FALSE, saveLambda = FALSE, kappamax = NULL, mumax = NULL)`. `sigma` is a deprecated alias for `scale`. — [spatstat.random rThomas](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rThomas.html)
- Model: parents form a homogeneous Poisson process of intensity κ. The parents are not restricted to `win`; the parent process is effectively Poisson on the whole plane. Each parent has a Poisson(μ) number of offspring, displaced by isotropic Gaussian noise with standard deviation `scale` (σ). When κ or μ is constant, the intensity is κμ. — [rThomas](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rThomas.html)
- Edge effects:
  - The "naive" algorithm expands `win` by `expand` (default 4·scale) and generates parents there. It "becomes very slow for large scale".
  - The default "BKBC" algorithm generates parents in the infinite plane, conditioned on having at least one offspring in `win`, which avoids edge effects. It is described as uniformly fast.
  - `nonempty = TRUE` generates only parents with at least one offspring in the window.
  - If the pair correlation deviates from Poisson by less than `poisthresh` (1e-6), the model is simulated as Poisson(κμ).
  
  — [rThomas](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rThomas.html)
- References given on that page:
  - Thomas, M. (1949), Biometrika 36:18–25.
  - Brix, A. & Kendall, W.S. (2002), "Simulation of cluster point processes without edge effects", Adv. Appl. Probab. 34:267–280.
  - Baddeley, A. & Chang, Y.-M. (2023), "Robust algorithms for simulating cluster point processes", J. Stat. Comput. Simul., DOI 10.1080/00949655.2023.2166045.
  - Waagepetersen (2007), Biometrics 63:252–258.
  
  — [rThomas](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rThomas.html)

**Matérn cluster process (spatstat `rMatClust`)**
- Signature: `rMatClust(kappa, scale, mu, win = square(1), nsim = 1, drop = TRUE, ..., n.cond = NULL, w.cond = NULL, algorithm = c("BKBC","naive"), nonempty = TRUE, poisthresh = 1e-6, saveparents = FALSE, saveLambda = FALSE, kappamax = NULL, mumax = NULL)`. — [rMatClust](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rMatClust.html)
- Model: offspring are Poisson(μ) in number and uniform in a disc of radius `scale` (R) around the parent. The stationary intensity is κμ. The naive algorithm expands the window by `scale`; BKBC is the default. — [rMatClust](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rMatClust.html)
- References: Matérn (1960), *Spatial Variation*, Meddelanden från Statens Skogsforskningsinstitut 59(5); Matérn (1986), *Spatial Variation*, Lecture Notes in Statistics 36, Springer. — [rMatClust](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rMatClust.html)

**General Neyman–Scott process (spatstat `rNeymanScott`)**
- Parents are Poisson(κ) in an expanded window: `as.rectangle(win)` extended by `expand` on each side. Each parent is replaced by a random cluster from `rcluster`, which is either a function `rcluster(x0, y0, ...)` or `list(mu, f)`. The pattern is then restricted to `win`. — [rNeymanScott](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rNeymanScott.html)
- With `list(mu, f)`, offspring counts are Poisson(μ) and "the process is a Cox process". The `parents` and `parentid` attributes are kept. Reference: Neyman & Scott (1958), JRSS B 20:1–43. — [rNeymanScott](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rNeymanScott.html)

**Gaussian mixture + uniform background ("clutter")**
- Dasgupta & Raftery (1998), "Detecting features in spatial point processes with clutter via model-based clustering", JASA 93:294–302. It extends Banfield & Raftery (1993) model-based Gaussian clustering with a uniform noise (clutter) component, and was applied to minefield detection. — [Dasgupta & Raftery PDF](https://sites.stat.washington.edu/raftery/Research/PDF/dasgupta1998.pdf); [Raftery spatial research page](https://sites.stat.washington.edu/raftery/Research/spatial.html)

**Log-Gaussian Cox process (spatstat `rLGCP`)**
- Model: the log of the random intensity is a Gaussian random field with mean μ and covariance c(r). Conditional on the intensity, the points are Poisson. — [rLGCP](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rLGCP.html)
- Covariance models:
  - exponential: σ²·exp(−r/h)
  - gauss: σ²·exp(−(r/h)²)
  - stable: σ²·exp(−(r/h)^α)
  - gencauchy: σ²·(1+(r/h)^α)^(−β/α)
  - Whittle–Matérn, with shape ν
  
  — [rLGCP](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rLGCP.html)
- Simulation: circulant embedding of the Gaussian field on a regular grid, then exponentiate, then `rpoispp`. The code was rewritten in spatstat.random 3.2-0, so results from earlier versions cannot be reproduced. Reference: Møller, Syversveen & Waagepetersen (1998), Scand. J. Stat. 25:451–482. — [rLGCP](https://search.r-project.org/CRAN/refmans/spatstat.random/html/rLGCP.html)
- Moments (Møller et al. 1998, Thm 1, as restated by a secondary source): intensity ρ(x) = exp{μ(x) + c(x,x)/2}, which is exp(μ + σ²/2) when stationary; pair correlation g(u,v) = exp{c(u,v)}. — [Palm-distribution tutorial, arXiv:1512.05871](https://arxiv.org/pdf/1512.05871); [Waagepetersen/Møller slides](https://people.math.aau.dk/~rw/Talks/isc.pdf)

**Poisson building block**
- A homogeneous Poisson process in W is simulated by drawing N ~ Poisson(λ|W|) and then placing the points independently and uniformly. — [Wikipedia: Poisson point process, §Simulation](https://en.wikipedia.org/wiki/Poisson_point_process)

### Inferences
- **Unified Cox view [own synthesis]**: Thomas and Matérn processes with Poisson(μ) offspring are shot-noise Cox processes, with Λ(x) = μ·Σ_c f(x−c) + λ_b. Here f is the displacement kernel and λ_b is an optional uniform background. Given the parents:
  - N(W) ~ Poisson(Λ(W));
  - conditional on N(W) = n, the n points are i.i.d. with density Λ(x)/Λ(W) on W.
  
  This is the standard Cox/Poisson conditional-uniformity property; I did not check a primary text for it.
- **Exact-N sampler [own derivation, verified by simulation]**: under the condition N(W) = N, the posterior over parent configurations is the prior reweighted by Λ(W)^N·e^{−Λ(W)}. Proposing parents from the prior and accepting with probability (Λ(W)/N)^N·e^{N−Λ(W)} is therefore exact, because the maximum over Λ is reached at Λ = N. Then draw N i.i.d. points. For a rectangle W = [0,a]×[0,b] and a Gaussian kernel, each parent's mass inside W factorises:

  m_c = [Φ((a−c_x)/σ) − Φ(−c_x/σ)]·[Φ((b−c_y)/σ) − Φ(−c_y/σ)], so Λ(W) = λ_b·A + μ·Σ m_c.

  Set μ = (1−w₀)N/(κA), so that E[N(W)] = N exactly; this holds because the process is stationary.
- **Acceptance rate [own derivation]**: write Λ(W) ≈ N + Normal(0, μ²κA) and the acceptance as ≈ exp(−(Λ−N)²/2N). This gives an acceptance rate ≈ 1/√(1 + μ(1−w₀)). The observed rates matched:

  | N | Setting | Predicted | Observed |
  |---|---|---|---|
  | 200 | μ = 8 | 0.333 | 0.368 / 0.350 |
  | 200 | μ = 20 | 0.218 | 0.212 |
  | 200 | μ = 5.6, w₀ = 0.3 | 0.451 | 0.474 |
  | 1000 | μ = 40 | 0.156 | 0.175 / 0.169 |
  | 1000 | μ = 100 | 0.0995 | 0.104 |

  [own simulation]
- **Naive alternative [own derivation]**: rerunning the whole simulation until N(W) = N succeeds with probability ≈ 1/√(2π·Var N(W)), where Var N(W) ≈ N(1+μ). That is about 1/106 for N = 200, μ = 8, versus about 2.9 parent draws per accepted sample for the exact sampler, so roughly 35× more work.
- **Approximate exact-N options [own synthesis]**:
  - Draw the parents once, then draw N i.i.d. points from Λ/Λ(W) with no acceptance step. This ignores the reweighting, so configurations with too few or too many parents are not corrected. It is fine for a game. I used it for Matérn and LGCP.
  - Or simulate with E[N] slightly above N and keep a uniformly random subset of N points. The claim that independent thinning leaves the pair correlation g unchanged is standard but **[unverified]** here.
- **Edge handling for a from-scratch implementation [own derivation]**:
  - For Thomas, expanding by 4σ leaves an omitted tail of 1−Φ(4) ≈ 3.2×10⁻⁵ per coordinate, which is negligible. For Matérn, expanding by R is exact.
  - When you draw offspring, choose a parent uniformly, displace it, and **reject** points outside W. Do not clip or reflect them. Rejection reproduces the truncated density Λ(x)·1_W(x) exactly; clipping piles points onto the border.
  - For Matérn, making the sampler exact needs the disc–rectangle intersection area for Λ(W). That is doable but adds code.
- **Gaussian mixture + background with exactly N points [own synthesis]**: each point is uniform on W with probability w₀; otherwise it comes from component j (with weight π_j) as N(c_j, σ_j²I), rejected if outside W.
  - If the centres c_j are Poisson(κ) in the expanded window, this equals the approximate Thomas+background sampler above.
  - With a fixed number m of centres, it is the Dasgupta–Raftery-style "features + clutter" model. It is simpler and gives a direct "number of clumps" dial.
- **LGCP in JS without FFT [own synthesis]**:
  - Approximate the Gaussian field with random Fourier features: Z(x) = √(2σ²/M)·Σ_j cos(ω_j·x + b_j), with ω_j ~ N(0, (2/h²)I) and b_j ~ U(0, 2π). This has covariance exactly σ²·exp(−|r|²/h²) and is approximately Gaussian (CLT). I used M = 300.
  - Draw N i.i.d. points ∝ exp(Z) by rejection against the grid maximum of Z plus a margin. The mean μ cancels when N is fixed.
  - Standard references are Shinozuka-type spectral simulation and random Fourier features **[unverified]**.
  - The exact grid alternative is circulant embedding with an FFT, as in spatstat.
- **Exact Poisson sampler from scratch [own synthesis]**: use Knuth's multiplication method for λ ≤ 30, and split larger λ into chunks of ≤ 30, since a sum of independent Poissons is Poisson. It is exact, simple and fast enough here.
- **Code used [own]**. Φ is computed from Abramowitz–Stegun 7.1.26 erf **[constant set from memory, |err| ≲ 1.5e-7]**:
```js
function thomasExactN(rng, nrm, N, kappa, sigma, w0 = 0) {      // unit square; nrm() = N(0,1)
  const e = 4*sigma, S = 1 + 2*e, lamB = w0*N, mu = (1 - w0)*N/kappa;
  for (;;) {
    const np = poisson(rng, kappa*S*S), px = new Float64Array(np), py = new Float64Array(np);
    let mass = 0;
    for (let i = 0; i < np; i++) { px[i] = -e + S*rng(); py[i] = -e + S*rng();
      mass += (Phi((1-px[i])/sigma) - Phi(-px[i]/sigma)) * (Phi((1-py[i])/sigma) - Phi(-py[i]/sigma)); }
    const Lam = lamB + mu*mass;
    if (!(Math.log(rng()) <= N*Math.log(Lam/N) + N - Lam)) continue;   // exact conditioning on N
    const pB = lamB/Lam, x = new Float64Array(N), y = new Float64Array(N);
    for (let k = 0; k < N;) {
      if (rng() < pB) { x[k] = rng(); y[k] = rng(); k++; continue; }
      for (;;) { const j = (rng()*np)|0, xx = px[j] + sigma*nrm(), yy = py[j] + sigma*nrm();
        if (xx >= 0 && xx <= 1 && yy >= 0 && yy <= 1) { x[k] = xx; y[k] = yy; k++; break; } }
    }
    return { x, y };
  }
}
```

### Gaps
- The `n.cond` and `w.cond` arguments appear in the `rMatClust` usage line, but their semantics were not in the fetched text. They are presumably conditional simulation given the count in `w.cond`, and the implementation is unknown.
- I did not read the BKBC algorithm details (Baddeley & Chang 2023).
- I did not access Baddeley–Rubak–Turner (2015) or Illian et al. (2008) directly. Formulas were checked against spatstat documentation and Aalborg lecture slides instead.

## 2. Quantifying and tuning "slight" clustering (K, L, g, Clark–Evans, nearest-neighbour distances; parameter ranges)

### Takeaway
Use the closed-form g(0) − 1 as the design dial, and the Donnelly-corrected Clark–Evans R measured on each instance as the check:
- Thomas: g(0) − 1 = 1/(4πκσ²)
- Matérn: g(0) − 1 = 1/(πκR²)
- LGCP: g(0) − 1 = e^{σ²} − 1
- A uniform background fraction w₀ multiplies the excess by (1−w₀)².

In my simulations:
- g(0) − 1 ≈ 0.5 gave R ≈ 0.91–0.93 ("slight").
- g(0) − 1 ≈ 1–2 gave R ≈ 0.70–0.90 (moderate).
- g(0) − 1 ≳ 6 gave R ≈ 0.33–0.77 (strong).

### Cited Findings
- Thomas second-order functions, with ω the offspring standard deviation:
  - K(r) = πr² + (1/κ)(1 − exp(−r²/(4ω²)))
  - g(t) = 1 + exp(−t²/(4ω²))/(4πω²κ)
  
  — [Waagepetersen, Rennes slides](https://people.math.aau.dk/~rw/Talks/rennes.pdf); [Leipzig slides](https://people.math.aau.dk/~rw/Talks/leipzig.pdf)
- The general link is K(r) = ∫_{‖x‖≤r} g(x) dx. — [Determinantal shot-noise Cox processes, arXiv:2112.04204](https://arxiv.org/pdf/2112.04204)
- LGCP pair correlation: g = exp(c), so g(0) = e^{σ²}. — [arXiv:1512.05871](https://arxiv.org/pdf/1512.05871)
- Clark–Evans R is the observed mean nearest-neighbour distance divided by the value expected for a Poisson process of the same intensity. R > 1 suggests regularity and R < 1 suggests clustering; the page calls it a "crude" measure. — [spatstat clarkevans](https://search.r-project.org/CRAN/refmans/spatstat.explore/html/clarkevans.html)
- Without edge correction R is positively biased, because true nearest neighbours may lie outside the window. The available corrections are:
  - "Donnelly": an adjusted Poisson mean, for rectangles only.
  - "guard": averaging over a sub-window only.
  - "cdf": a Kaplan–Meier-type estimate of G(r).
  
  — [clarkevans](https://search.r-project.org/CRAN/refmans/spatstat.explore/html/clarkevans.html)
- References: Clark & Evans (1954), "Distance to nearest neighbour as a measure of spatial relationships in populations", Ecology 35:445–453; Donnelly (1978), in Hodder (ed.), *Simulation Studies in Archaeology*, CUP, pp. 91–95. — [clarkevans](https://search.r-project.org/CRAN/refmans/spatstat.explore/html/clarkevans.html)
- Nearest-neighbour and contact-distance distributions have been derived for the Matérn cluster process. Its contact distance stochastically dominates both its own nearest-neighbour distance and the contact distance of a Poisson process of equal density. — [Afshang, Saha & Dhillon, arXiv:1708.08438](https://ar5iv.arxiv.org/html/1708.08438)
- Processes higher in directionally convex (dcx) order "cluster more". Comparisons of Ripley's K and pair-correlation functions suggest this, and simulations of perturbed lattices confirm it. — [Inria TREC activity report](https://www.di.ens.fr/~blaszczy/trec/RA/RA2010/trec/uid79.html)

### Inferences
- **General Neyman–Scott pair correlation with Poisson offspring [own derivation]**: g(r) = 1 + h(r)/κ, where h is the density of the difference of two independent displacements.
  - Thomas: h is the density of N(0, 2σ²I), which reproduces the cited formula.
  - Matérn: h(r) = |B(0,R) ∩ B(r,R)|/(πR²)². So g(r) = 1 + [2R²·arccos(r/2R) − (r/2)·√(4R² − r²)]/(κπ²R⁴) for r ≤ 2R, and 1 beyond. This gives g(0) − 1 = 1/(πκR²), the same as Thomas when **R = 2σ**.
  - Matérn K has no simple closed form; integrate g numerically.
- **Superposition with an independent uniform background [own derivation]**: with a fraction w₀ of the points from the background, g(r) − 1 = (1−w₀)²·(g_cluster(r) − 1).
- **Index of dispersion [own derivation]**: for quadrats much larger than the clusters, the variance/mean ratio tends to 1 + μ(1−w₀). So μ, the number of points per clump, sets large-scale count variability, while s = σ√κ sets the peak of g.
- **Dimensionless dials for the generator [own synthesis]**:

| Dial | Thomas | Matérn | LGCP (gauss cov.) | Mixture + background |
|---|---|---|---|---|
| Clump size | σ (g − 1 falls by e⁻¹ at r = 2σ) | R (g = 1 beyond 2R) | h | σ_j |
| Peak excess g(0) − 1 | 1/(4πs²), with s = σ√κ | 1/(πκR²) | e^{σ²} − 1 | × (1−w₀)² |
| Number of clumps | κA | κA | ≈ A/(πh²) (rough) | m |
| Points per clump | μ = (1−w₀)N/(κA) | same | — | (1−w₀)N/m |

- **Measured Clark–Evans R versus the dials [own simulation]** (unit square; 400 reps at N = 200 and 150 reps at N = 1000; R is Donnelly-corrected):

| Model (parameters) | g(0)−1 | R (N=200) | R (N=1000) |
|---|---|---|---|
| Uniform (binomial) | 0 | 1.003 | 1.000 |
| Thomas κ=25, σ=0.08 (s=0.40) | 0.50 | 0.916 | 0.927 |
| Thomas κ=25, σ=0.04 (s=0.20) | 1.99 | 0.687 | 0.710 |
| Thomas κ=10, σ=0.025 (s=0.079) | 12.7 | 0.334 | 0.348 |
| Thomas κ=25, σ=0.04 + 30% background | 0.97 | 0.873 | 0.895 |
| Matérn κ=25, R=0.16 | 0.50 | 0.909 | 0.905 |
| LGCP gauss σ²=0.5, h=0.1 | 0.65 | 0.923 | 0.935 |
| LGCP gauss σ²=2, h=0.1 | 6.39 | 0.747 | 0.772 |

- **Proposed bands [own proposal; no literature defines "mild" numerically]**:
  - "Slightly grouped": R ≈ 0.85–0.95 and g(0) − 1 ≲ 1. For Thomas this is s = σ√κ ≳ 0.3, or a moderate s ≈ 0.2 diluted with w₀ ≈ 0.3–0.5 background.
  - Moderate: R ≈ 0.65–0.85.
  - Strong: R < 0.6, with g(0) − 1 ≳ 5.
  
  R depends only weakly on N at fixed (κ, σ). g(0) is **not** a model-independent predictor of R: LGCP with g(0)−1 = 6.4 gave R ≈ 0.76, while Thomas with g(0)−1 = 2 gave R ≈ 0.70. The LGCP's correlation spreads over a larger scale (h = 0.1) with no discrete clumps. So calibrate the dial separately for each model, and use the measured R as the gate.
- **Donnelly correction used [unverified formula, validated empirically]**: E[mean NN distance] ≈ 0.5√(A/N) + (0.0514 + 0.041/√N)·P/N, where P is the perimeter. I took this from memory of the spatstat implementation. Uniform points gave R_D = 1.003 at N = 200 and 1.000 at N = 1000, while the uncorrected R was 1.034 and 1.013. That supports the formula and shows the positive edge bias the spatstat page describes.
- **In-app estimation [own synthesis]**:
  - K̂(r) = (A/(N(N−1)))·Σ_{i≠j} 1{d_ij ≤ r}·w_ij, with the translation edge correction for a rectangle: w_ij = ab/((a−|Δx|)(b−|Δy|)). The translation-correction form is standard (Ohser–Stoyan) but **[unverified]** here.
  - L̂(r) = √(K̂(r)/π), and plot L̂(r) − r. Under complete spatial randomness L(r) − r ≈ 0. This is the standard Besag (1977) definition, **[unverified]** here.
  - Clark–Evans only sees nearest-neighbour scales. Show g or L − r at r ≈ 1–3σ to make the clump scale visible.

### Gaps
- I found no published numeric thresholds for "mild" versus "strong" clustering; the bands above are mine.
- I did not fetch the closed form of the Thomas nearest-neighbour distance distribution (Afshang et al. also have a Thomas paper).
- I did not verify typical fitted parameters for classic datasets such as redwood or Finnish pines.

## 3. Random geometric graph connectivity for uniform/Poisson points (Penrose, Gupta–Kumar, connectivity probability, the 4.51 percolation constant, boundary effects)

### Takeaway
Asymptotically, NπM² − ln N tends to a Gumbel distribution: P(G_r connected) → exp(−N·e^{−Nπr²}). Gupta–Kumar give the threshold πr²N = ln N + c_N, with connectivity whp iff c_N → ∞.

Percolation is a much weaker requirement. A giant component appears at mean degree λπr² = 4η_c ≈ 4.512, with η_c = 1.12808737.

At game-scale N (50–2000) in a square, boundary effects and isolated pairs or small groups matter a lot. The median minimum reach is k_med ≈ (1.54–1.79)·√(A/N), which corresponds to a mean degree of about 7.5–10 at threshold. Formulas that only count isolated points underestimate it by 4–12%.

### Cited Findings
- Penrose (1997), "The longest edge of the random minimal spanning tree", Ann. Appl. Probab. 7(2), DOI 10.1214/aoap/1034625335 (pages 340–361 from memory). For n uniform points on the unit square, let M_n be the longest edge of the nearest-neighbour graph and M′_n the longest edge of the MST. Then nπM_n² − log n converges weakly to the double-exponential (Gumbel) law, and P[M′_n = M_n] → 1, so the same limit holds for the MST. — [Penrose abstract (Bath)](https://people.bath.ac.uk/masmdp/ab/longest.html); [Project Euclid](https://projecteuclid.org/journals/annals-of-applied-probability/volume-7/issue-2/The-longest-edge-of-the-random-minimal-spanning-tree/10.1214/aoap/1034625335.full)
- With high probability the longest MST edge is about √(log n/(πn)). It is typically a leaf edge joining an outlying point to its nearest neighbour, and its distribution converges to a Gumbel distribution (Penrose 1997). — [Wikipedia: Euclidean minimum spanning tree](https://en.wikipedia.org/wiki/Euclidean_minimum_spanning_tree)
- Gupta & Kumar showed that in d = 2, if πr(n)² = (log n + c_n)/n, then as n → ∞ the graph is connected whp iff c_n → ∞. — [Goel, Rai & Krishnamachari, "sharp thresholds" paper](https://web.stanford.edu/~ashishg/papers/gnrn.pdf)
- The same paper says that the radius needed for connectivity and the largest nearest-neighbour distance (the smallest radius with no isolated nodes) are identical whp. It also shows that all monotone properties of random geometric graphs have sharp thresholds. — [gnrn.pdf](https://web.stanford.edu/~ashishg/papers/gnrn.pdf)
- Bibliography: Gupta & Kumar, "Critical Power for Asymptotic Connectivity in Wireless Networks", in *Stochastic Analysis, Control, Optimization and Applications* (Birkhäuser), pp. 547–566. The chapter is © 1999, not 1998 as in the brief. A 1998 IEEE CDC version may exist **[unverified]**. — [Springer chapter](https://link.springer.com/doi/10.1007/978-1-4612-1784-8_33)
- Coon, Dettmann & Georgiou (2012), "Full Connectivity: Corners, edges and faces", J. Stat. Phys. 147:758–778, DOI 10.1007/s10955-012-0493-y, give a cluster expansion for high density:
  - General form: P_fc ≈ 1 − ρ∫_V exp(−ρM(r)) dr, with connectivity mass M(r) = ∫ H(|r−r′|) dr′.
  - Homogeneous case: P_fc ≈ 1 − N·e^{−πr₀²ρ}[1 + π/(4r₀²ρ) + …].
  - Exponents for the unit-disk model: bulk πρr₀², edge πρr₀²/2, and a corner of angle ϑ gives ϑρr₀²/2.
  
  — [ar5iv full text](https://ar5iv.labs.arxiv.org/html/1201.3123); [arXiv:1201.3123](https://arxiv.org/abs/1201.3123)
- In the same paper, boundary effects are "not only relevant but dominant" for full connectivity at high density. In a square the corner term dominates at high density, with an intermediate density window where edges dominate. For the unit-disk model, higher-order corrections differ only algebraically "and can matter". The square formula is given explicitly only for the soft Rayleigh connection function H = e^{−βr²} (Eq. 41), whose corner coefficient has an apparent ρ vs ρ² typo between Eq. 41 and §3.4. — [ar5iv 1201.3123](https://ar5iv.labs.arxiv.org/html/1201.3123)
- Mertens & Moore (2012), "Continuum percolation thresholds in two dimensions", Phys. Rev. E 86:061109, give **η_c(disks) = 1.12808737(6)**, where η = ρa and a is the disk area. The critical covered area fraction is φ_c = 1 − e^{−η_c} = 0.67634831(2). — [ar5iv 1209.4936](https://ar5iv.labs.arxiv.org/html/1209.4936); [arXiv:1209.4936](https://arxiv.org/abs/1209.4936)
- Earlier estimates, as compared in that paper: Quintanilla & Ziff (2007) gave 1.128085(2). Rigorous 99.99%-confidence bounds by Balister, Bollobás & Walters (2005) are 1.127 ≤ η_c ≤ 1.12875. — [ar5iv 1209.4936](https://ar5iv.labs.arxiv.org/html/1209.4936)
- Bettstetter (2002), "On the minimum node degree and connectivity of a wireless multihop network", ACM MobiHoc, pp. 80–91, studies minimum node degree and k-connectivity. The commonly quoted approximation P(connected) ≈ (1 − e^{−ρπr²})^n is **[unverified]** against the paper. — [ACM DOI](https://www.doi.org/10.1145/513800.513811)

### Inferences
- **Percolation constant as a mean degree [own derivation]**: disks of radius r overlap when their centres are within 2r. The connection radius is k = 2r, so the mean degree is λπk² = 4λπr² = 4η. That gives a critical mean degree of **4η_c ≈ 4.5123**. Mertens & Moore do not state the overlap rule explicitly, but their binning by disk diameter implies it.
  - Percolation is a giant component in the infinite plane. It is **not** full connectivity: an agent with mean degree 4.5 is stranded almost surely in any large instance.
- **Hard-disk boundary terms for a rectangle [own derivation, consistent with Coon et al.'s exponents]**: with density ρ = N/A, perimeter P and four right-angle corners,

  E[#isolated at r] ≈ ρA·e^{−ρπr²} + (P/(2r))·e^{−ρπr²/2} + 4·e^{−ρπr²/4}/(ρr²).

  For the unit square this is N·e^{−Nπr²} + (2/r)·e^{−Nπr²/2} + 4·e^{−Nπr²/4}/(Nr²). The general corner term for angle ϑ is e^{−ρϑr²/2}/(ρr²·sin ϑ).
- **Boundary terms vanish only slowly [own derivation]**: at the critical scaling Nπr² = ln N + α:
  - the edge term is ≈ 2√(π/ln N)·e^{−α/2}, which vanishes like 1/√ln N;
  - the corner term is ≈ (4π/ln N)·N^{−1/4}·e^{−α/4}.
  
  This is consistent with Penrose's square result holding asymptotically. At N = 1000 the edge prefactor is still ≈ 1.35.
- **Isolated points versus connectivity [own simulation]**: the exact expected isolated count for N binomial points is N∫_W(1 − |B(x,r)∩W|)^{N−1}dx. My numerical integral matched the Monte Carlo isolated count, and P(no isolated point) ≈ exp(−E) to within 0.01–0.02. But at game-scale N, P(connected) is far below P(no isolated point), because isolated pairs and small groups near edges and corners also disconnect the graph:

| N, r | E[#iso] (integral) | MC P(no isolated pt) | MC P(connected) |
|---|---|---|---|
| 200, 0.1069 | 0.696 | 0.493 | **0.211** |
| 200, 0.1162 | 0.342 | 0.719 | **0.514** |
| 1000, 0.0527 | 0.693 | 0.508 | **0.287** |
| 1000, 0.0558 | 0.375 | 0.703 | **0.542** |

  The bottleneck edge equalled the largest nearest-neighbour distance in only 47% (N = 200) and 52% (N = 1000) of uniform instances. That is consistent with Penrose's P[M′ = M] → 1, which converges slowly.
- **Predicted versus Monte Carlo median minimum reach M (uniform, unit square) [own simulation]**:

| N | Bulk/Penrose √((lnN+0.3665)/(Nπ)) | 3-term formula | Exact isolated-point integral | MC median, square | MC median, torus |
|---|---|---|---|---|---|
| 100 | 0.1258 | 0.1522 | 0.1438 | **0.1606** | 0.1326 |
| 200 | 0.0950 | 0.1111 | 0.1069 | **0.1165** | 0.0994 |
| 500 | 0.0647 | 0.0733 | 0.0717 | **0.0765** | 0.0667 |
| 1000 | 0.0481 | 0.0535 | 0.0527 | **0.0549** | 0.0494 |
| 2000 | 0.0356 | 0.0390 | 0.0386 | **0.0401** | 0.0363 |

- **Calibration table for the simulator: k-reach in units of mean spacing √(A/N), uniform points [own simulation]** (reps: 3000/2000/1000/400/200/100):

| N | Square: 5% / 50% / 95% of M·√(N/A) | Mean degree at median | Torus: 5% / 50% / 95% | Torus mean degree |
|---|---|---|---|---|
| 50 | 1.28 / 1.54 / 2.05 | 7.5 | 1.09 / 1.25 / 1.48 | 4.9 |
| 100 | 1.35 / 1.61 / 2.08 | 8.1 | 1.18 / 1.33 / 1.57 | 5.5 |
| 200 | 1.42 / 1.65 / 2.10 | 8.5 | 1.25 / 1.41 / 1.66 | 6.2 |
| 500 | 1.46 / 1.71 / 2.18 | 9.2 | 1.35 / 1.49 / 1.71 | 7.0 |
| 1000 | 1.54 / 1.74 / 2.11 | 9.5 | 1.41 / 1.56 / 1.82 | 7.7 |
| 2000 | 1.60 / 1.79 / 2.16 | 10.1 | 1.48 / 1.62 / 1.84 | 8.3 |

  So in a bounded square, the minimum reach is ≈ 1.6–1.8 mean spacings for N in the hundreds. It is 10–25% above the torus value, and the torus is 2–7% above the Penrose bulk formula. The distribution is right-skewed: the 95th percentile is about 1.2–1.3× the median.
- **Practical use [own synthesis]**:
  - Compute M exactly for every instance (Section 5); never infer it from a formula.
  - Use the table to explain the scaling k_min ∝ √(A·ln N/(πN)), and to pick (N, A, k) presets with a target feasibility probability.
  - Use the closed forms only as an explanation of why: the bulk term means "a point in a sparse spot", and the edge and corner terms mean "points near the border have only half or a quarter of a neighbourhood".

### Gaps
- I found no closed-form finite-N formula for P(connected) in a square that includes isolated pairs and small groups. The Coon et al. cluster expansion includes higher-order terms but gives explicit square constants only for the soft connection model.
- I did not access the original Gupta–Kumar text, Penrose's *Random Geometric Graphs* (OUP 2003), or Meester & Roy's *Continuum Percolation* (CUP 1996).
- Penrose's k-connectivity result (the threshold coincides with minimum degree ≥ k whp) is relevant to robustness but was not verified this session **[unverified]**.

## 4. Connectivity for clustered (non-Poisson) point processes

### Takeaway
There is no general theorem that more clustering always means a larger critical radius:
- Sub-Poisson processes have a non-trivial phase transition.
- A suitably constructed Cox process that is "more clustered" than Poisson can percolate at arbitrarily small radius.
- Heuristically and in simulations, clustering usually hurts.

I found no paper on the full-connectivity threshold of random geometric graphs over Thomas or Matérn points, so I measured it. Relative to uniform points with the same N:
- mild clustering raises the minimum reach M by 1.2–1.6×;
- moderate clustering raises it by 1.7–2.6×;
- strong clustering raises it by 3–5.6×.

The bottleneck turns from "an isolated point" into "a gap between groups". For strong clustering it stops shrinking as N grows, because the parent spacing 1/√κ sets it. A uniform background acts as stepping stones and removes much of the penalty.

### Cited Findings
- Błaszczyszyn & Yogeshwaran, "Clustering and percolation of point processes", Electron. J. Probab. 18 (2013), no. 72, 1–20, DOI 10.1214/EJP.v18-2468. Processes with smaller void probabilities and factorial moment measures than Poisson ("cluster less") show non-trivial phase transitions in percolation of coverage models; examples are determinantal and some perturbed-lattice processes. — [arXiv:1112.2227](https://arxiv.org/abs/1112.2227); [EJP](https://www.maths.tcd.ie/EMIS/journals/EJP-ECP/article/view/2468.html)
- The same paper constructs a Cox process that is more clustered than Poisson and whose Boolean model percolates for arbitrarily small radius. So clustering "does not always 'worsen' percolation", and the Poisson upper bound on clustering is a necessary assumption for the phase transition. — [arXiv:1112.2227](https://arxiv.org/abs/1112.2227)
- The Inria TREC team reports:
  - The heuristic that clustering hurts Boolean-model percolation is supported by simulations.
  - They define lower and upper critical radii that sandwich the usual one. dcx order preserves the upper and reverses the lower.
  - For sub-Poisson (dcx-dominated) processes, the classical Gilbert-graph phase transition and an SINR-graph result extend. The work is in Yogeshwaran's 2010 PhD thesis.
  
  — [TREC 2010 activity report](https://www.di.ens.fr/~blaszczy/trec/RA/RA2010/trec/uid79.html)
- Penrose, "Extremes for the minimal spanning tree on normally distributed points", treats n points i.i.d. from a d-dimensional standard normal. Its longest MST edge is the infimum of r such that the union of balls of radius r/2 is connected, and it has a Gumbel limit after rescaling by √(2 log n), with centring that grows like (d−1)·log log n. The page now redirects; this description comes from search snippets. The venue is probably Adv. Appl. Probab. 1998 **[unverified]**. — [Penrose abstract page](https://people.bath.ac.uk/masmdp/ab/normal.html)
- Caroni & Prescott (2002) argue that those normal-case asymptotics are too inaccurate at practical n to improve Rohlf's gap test for outliers. — [J. Multivariate Anal. 83:487–492 (RePEc)](https://ideas.repec.org/a/eee/jmvana/v83y2002i2p487-492.html)
- In Boolean–Poisson cluster sensor-network models (Matérn/Thomas), clustered deployments need less power per cluster but give lower coverage. — [arXiv:2001.11920](https://arxiv.org/pdf/2001.11920)
- My searches surfaced no source that treats connectivity of a random geometric graph over Thomas-process nodes. — (searches this session; closest results were Poisson/uniform RGG papers, e.g. [arXiv:1601.03296](https://arxiv.org/pdf/1601.03296))

### Inferences
- **Minimum reach M under clustering [own simulation]** (unit square, exactly N points; median with [5%, 95%]; "×U" is the ratio to the uniform median):

| Model | g(0)−1 | M, N=200 | ×U | M, N=1000 | ×U | P(M = max NN dist) 200/1000 | median M/maxNN 200/1000 |
|---|---|---|---|---|---|---|---|
| Uniform | 0 | 0.116 [0.100, 0.151] | 1.00 | 0.056 [0.049, 0.067] | 1.00 | 0.47 / 0.52 | 1.01 / 1.00 |
| Thomas κ=25, σ=0.08 (mild) | 0.50 | 0.144 [0.111, 0.227] | 1.23 | 0.088 [0.065, 0.140] | 1.57 | 0.44 / 0.65 | 1.04 / 1.00 |
| Thomas κ=25, σ=0.04 (moderate) | 1.99 | 0.196 [0.144, 0.292] | 1.69 | 0.143 [0.092, 0.243] | 2.57 | 0.10 / 0.15 | 1.68 / 1.71 |
| Thomas κ=10, σ=0.025 (strong) | 12.7 | 0.350 [0.231, 0.505] | 3.01 | 0.311 [0.211, 0.450] | 5.57 | 0.05 / 0.05 | 5.68 / 5.74 |
| Thomas moderate + 30% background | 0.97 | 0.147 [0.119, 0.200] | 1.27 | 0.082 [0.069, 0.106] | 1.48 | 0.38 / 0.55 | 1.07 / 1.00 |
| Matérn κ=25, R=0.16 (mild) | 0.50 | 0.143 [0.112, 0.216] | 1.23 | 0.075 [0.060, 0.176] | 1.35 | 0.35 / 0.39 | 1.11 / 1.06 |
| LGCP σ²=0.5, h=0.1 | 0.65 | 0.135 [0.113, 0.184] | 1.16 | 0.073 [0.062, 0.109] | 1.31 | 0.34 / 0.56 | 1.08 / 1.00 |
| LGCP σ²=2, h=0.1 | 6.39 | 0.181 [0.140, 0.262] | 1.56 | 0.106 [0.081, 0.148] | 1.90 | 0.36 / 0.48 | 1.10 / 1.01 |

- **What sets M changes with clustering [own simulation]**: the largest nearest-neighbour distance ("maxNN") is never longer than M.
  - For uniform points, M equals maxNN about half the time: the bottleneck is an isolated point or pair.
  - For moderate and strong Thomas clustering, M equals maxNN only 5–15% of the time, and M is 1.7–5.7× maxNN. The bottleneck is a **gap between groups**, and every point still has a close neighbour.
  - Isolated-point formulas, including the Cox version N∫f(x)(1 − F(B(x,r)))^{N−1}dx **[own derivation]**, therefore miss the dominant failure mode for clustered instances.
- **Scaling with N [own simulation]**:
  - For uniform points M ∝ √(ln N/N), so going from N = 200 to 1000 multiplies M by 0.48.
  - For strong clustering at fixed κ, M barely moves (0.350 → 0.311). It stays near the parent spacing 1/√κ = 0.316. Adding points does not rescue an instance whose clusters are too far apart.
  - Mild clustering falls in between (×0.61).
- **Mechanism model [own inference]**:
  - When clusters are well separated (s = σ√κ ≲ 0.15), M is roughly the connectivity threshold of the parent Poisson process with κA points, reduced by about two cluster radii (≈ 2–3σ).
  - When clusters overlap (s ≳ 0.3), M is set by isolated points in low-intensity valleys, as in the uniform case but at a lower local density.
  - Gaussian tails also produce within-cluster outliers. Penrose's normal-points result implies these shrink only like ~(log log m)/√(2 log m) in units of σ for m points per cluster, but in practice they are smaller than inter-cluster gaps.
- **Model-specific notes [own simulation]**:
  - Matérn, whose clusters have hard edges, has a heavier upper tail than Thomas at equal g(0): the 95th percentile at N = 1000 is 0.176 versus 0.140.
  - LGCP bottlenecks are often isolated points in intensity valleys (P(M = maxNN) ≈ 0.34–0.56), because the log-normal intensity has long low tails.
- **Generator advice for guaranteed-feasible instances [own synthesis]**:
  1. Generate, compute M, and reject or redraw if M > k. Generation and M are cheap, so this is the simplest approach.
  2. Add a background fraction (w₀ ≈ 0.3), which cut M from 0.143 to 0.082 at N = 1000.
  3. Keep inter-parent spacing 1/√κ comparable to k.
  4. Repairing an instance by inserting bridge points along the bottleneck edge works but biases the distribution.

### Gaps
- I found no rigorous or published simulation result on the **full-connectivity** threshold (as opposed to percolation) for random geometric graphs over Thomas or Matérn processes. The numbers above are my own.
- The 2010 Allerton papers referenced in the TREC report were not identified by title or author.
- I did not obtain an explicit critical-radius formula for Poisson cluster processes.

## 5. Practical algorithm: minimum feasible k = longest EMST edge (bottleneck), computed via Delaunay + Kruskal in JavaScript

### Takeaway
The smallest k for which G_k is connected is exactly the longest edge M of any Euclidean minimum spanning tree; every MST is a minimum-bottleneck spanning tree.

Computing it takes three steps:
1. Delaunay-triangulate with Delaunator. The EMST lies inside the Delaunay triangulation, which has ≤ 3N−6 edges.
2. Sort the edges by squared length.
3. Run union-find until one component remains.

This is O(N log N). For N ≲ 2000, an O(N²) Prim with no dependencies takes about 10 ms. Show the bottleneck edge to explain why an instance is impossible.

### Cited Findings
- The EMST is contained in the relative neighbourhood graph, which is contained in the Urquhart graph, then the Gabriel graph, then the Delaunay triangulation. The Delaunay triangulation is planar with at most 3n − 6 edges and is computed in O(n log n). A graph MST on those edges then costs O(n log n) in total (Shamos & Hoey 1975), which is optimal in some models. — [Wikipedia: EMST](https://en.wikipedia.org/wiki/Euclidean_minimum_spanning_tree)
- Planar MSTs have maximum degree 6, and edges at a vertex meet at angles ≥ 60°. For integer coordinates there is an O(n log log n) randomized algorithm (Buchin & Mulzer 2011). — [Wikipedia: EMST](https://en.wikipedia.org/wiki/Euclidean_minimum_spanning_tree)
- The longest MST edge equals the infimum of r such that the union of balls of radius r/2 around the points is connected. That union is connected exactly when G_r is connected. — [Penrose, normal-points abstract](https://people.bath.ac.uk/masmdp/ab/normal.html)
- For uniform points, the longest MST edge coincides with the longest nearest-neighbour edge with probability tending to 1. — [Penrose 1997 abstract](https://people.bath.ac.uk/masmdp/ab/longest.html)
- Delaunator is "an incredibly fast and robust JavaScript library for Delaunay triangulation of 2D points". — [Delaunator README](https://github.com/mapbox/delaunator)
- Delaunator API:
  - `new Delaunator(coords)` takes a flat `[x0, y0, x1, y1, …]`, ideally a typed array. `Delaunator.from(points, getX, getY)` takes an array of points.
  - `triangles` is a Uint32Array, three vertex indices per triangle, counter-clockwise.
  - `halfedges` is an Int32Array giving the twin half-edge, or −1 on the hull.
  - `hull` is a Uint32Array, counter-clockwise.
  - `update()` recomputes after in-place changes to `coords`.
  
  — [Delaunator README](https://github.com/mapbox/delaunator)
- Benchmarks (2017 MacBook Pro, Node 10.10): 100k uniform points in 82 ms; 1M uniform in 1.07 s; 1M Gaussian in 950 ms. Delaunator uses robust-predicates (a port of Shewchuk's predicates) and "should produce valid output even on highly degenerate input". `Delaunator.from` skips duplicate points. The license is ISC, and the install examples pin v5.0.0. — [Delaunator README](https://github.com/mapbox/delaunator)
- d3-delaunay computes Voronoi diagrams and is based on Delaunator (Voronoi cells come from circumcentres of adjacent triangles). License ISC. — [d3-delaunay README](https://github.com/d3/d3-delaunay)

### Inferences
- **Proof sketch that k_min = M [own derivation; elementary]**: Kruskal adds edges in increasing length. After it has processed every edge of length ≤ k, its union-find components are exactly the connected components of G_k. Kruskal's added edges form a spanning forest of G_k, and any edge of G_k that it skipped joined vertices already connected. So G_k is connected iff every MST edge is ≤ k. Use "≤ k" consistently with a small epsilon, since the rules say "within distance k".
- **Explaining impossibility [own synthesis]**: deleting the bottleneck edge (u, v) splits the points into two groups S and S̄, and no pair across them is closer than M. For k < M:
  - G_k's components are the MST forest after deleting every MST edge longer than k.
  - The UI can colour components, show how many points lie outside the start's component, and draw the critical gap.
- **JS implementation [own; the edge-iteration idiom is from my memory of the Delaunator guide, **[unverified]** but consistent with the README's `halfedges` definition]**:
```js
import Delaunator from 'delaunator';
function minFeasibleK(xs, ys) {                       // -> { k, u, v } ; k = longest EMST edge
  const n = xs.length; if (n < 2) return { k: 0, u: -1, v: -1 };
  const c = new Float64Array(2*n); for (let i = 0; i < n; i++) { c[2*i] = xs[i]; c[2*i+1] = ys[i]; }
  const { triangles: T, halfedges: H } = new Delaunator(c);
  const eu = [], ev = [], ew = [];
  for (let e = 0; e < T.length; e++) if (e > H[e]) {  // each undirected edge once (H[e] = -1 on hull)
    const a = T[e], b = T[e % 3 === 2 ? e - 2 : e + 1];
    eu.push(a); ev.push(b); ew.push((xs[a]-xs[b])**2 + (ys[a]-ys[b])**2);
  }
  const ord = Array.from(ew.keys()).sort((p, q) => ew[p] - ew[q]);
  const par = Int32Array.from({ length: n }, (_, i) => i);
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  let comps = n;
  for (const id of ord) { const a = find(eu[id]), b = find(ev[id]);
    if (a !== b) { par[a] = b; if (--comps === 1) return { k: Math.sqrt(ew[id]), u: eu[id], v: ev[id] }; } }
  return primFallback(xs, ys);   // duplicates were skipped / all points collinear (no triangles): use O(N^2) Prim
}
```
- **O(N²) Prim fallback [own simulation code]**: keep d[i], the squared distance to the tree. Repeatedly add the closest non-tree vertex, track the maximum d added, and update d. With no dependencies, N = 2000 takes on the order of 10–15 ms in Node 26 on this machine (rough measurement: about 3×10⁸ inner-loop updates per second). That is fast enough to recompute after every stroke for N ≲ 2000.
- **Degenerate inputs [own synthesis]**:
  - Duplicate points: Delaunator skips them, so they never join a component. Pre-merge duplicates (distance 0) or use the fallback.
  - All points collinear: Delaunator probably produces no triangles **[unverified]**. Sort along the line instead, or use Prim.
- **Game-structure inference (depends on rule details) [own inference]**:
  - Piles are founded on points, strokes end in existing piles, and merges move piles onto piles. So the set of occupied locations is always a **subset of the original point locations**, and its k-graph is an induced subgraph of the initial G_k. Reachability can only be lost, never created.
  - Therefore, if every point must be selected from within k (sweep half-width l = 0), then **k ≥ M is necessary**.
  - If capsule sweeps (l > 0) can capture points the agent never approaches, M is no longer strictly necessary. If stroke destinations must also be within k, every point must lie within k + l of a location reachable from the start.
  - In no case is k ≥ M sufficient, because strokes remove vertices (Section 6). The simulator should show M as the "walk-connectivity" threshold and say which rule variant applies.

### Gaps
- The README does not document the `nextHalfedge` edge-iteration helper or collinear handling; these come from my memory of the Delaunator guide.
- I did not fetch the API docs at d3js.org/d3-delaunay (e.g., `neighbors`, `find`, `update`).
- The Wikipedia page does not itself state the minimum-bottleneck-spanning-tree property; the proof above stands in for it.

## 6. Dynamic connectivity under vertex removal (random vs targeted/contiguous removal; robustness), relevant because raking removes contiguous swaths

### Takeaway
Random removal is Poisson thinning: k_min grows only like √(ln(pN)/(πpλ)), about ×1.18 when 30% of N = 1000 points are removed.

Contiguous removal behaves differently:
- A compact interior hole barely changes the bottleneck (×1.03), because paths go around it. It does disconnect things when it cuts off a corner or border sliver.
- A swath wider than k spanning the region disconnects it outright: a 0.3-wide band multiplied M by 5.5.
- Many short rake-like capsules leave stranded remnants, and are worse than removing the same number of points at random (×1.33).

The literature on localized attacks confirms that geographically contiguous damage is qualitatively different from random damage. For game-scale N, recomputing the EMST bottleneck or articulation points after each candidate stroke is cheap, and leaf-first removal orders never disconnect the graph.

### Cited Findings
- In "Spatially localized attacks on interdependent networks: the existence of a finite critical attack size" (published as Sci. Rep. 5:8934, 2015; Berezin et al., author list from memory), a localized attack removes all nodes within distance r_h of a random location. In interdependent spatially embedded networks, attacks above a finite critical size spread through the whole system, while smaller attacks stay local. Random attacks instead need to remove a finite fraction of nodes. — [arXiv:1310.0996](https://arxiv.org/pdf/1310.0996); [DOI 10.1038/srep08934](https://dx.doi.org/10.1038/srep08934)
- Shao, Huang, Stanley & Havlin developed a percolation framework for localized attack on single networks (Erdős–Rényi, random-regular and scale-free). The venue, New J. Phys. 17:023049 (2015), is **[unverified]**. — [Bar-Ilan record](https://cris.biu.ac.il/en/publications/percolation-of-localized-attack-on-complex-networks/)
- Zhang, Yeh & Modiano model interdependent networks as random geometric graphs and derive analytical upper bounds on percolation thresholds. If node densities exceed those bounds, the interdependent RGGs stay percolated after a geographical attack. — [arXiv:1709.03032](https://arxiv.org/abs/1709.03032v1)
- In spatial k-core systems, a microscopic localized attack can trigger collapse, and the critical localized attack size does not depend on system size. — [arXiv:2311.13579](https://arxiv.org/pdf/2311.13579)
- Kaplan, Kauer, Klost, Knorr, Mulzer, Roditty & Seiferth, "Dynamic Connectivity in Disk Graphs" (SoCG 2022; Discrete Comput. Geom. 2024): for unit disk graphs, O(log² n) amortized update and O(log n/log log n) amortized query. For bounded radius ratio Ψ, the fully dynamic amortized update is O(Ψ·λ₆(log n)·log⁷ n). Bounds differ across versions. — [arXiv:2106.14935](https://arxiv.org/pdf/2106.14935); [LIPIcs SoCG 2022](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SoCG.2022.49)
- For general disk graphs with insertions only, there is an o(n²) total-time structure with O(log⁶ n) expected amortized insertion. — [arXiv:2306.15338](https://arxiv.org/html/2306.15338v1)
- The giant-component criterion in the plane is mean degree 4η_c ≈ 4.512 (η_c = 1.12808737). — [Mertens & Moore](https://ar5iv.labs.arxiv.org/html/1209.4936)

### Inferences
- **Random removal [own inference]**: independent p-thinning of Poisson(λ) is Poisson(pλ) (the standard thinning theorem; I did not fetch it). So:
  - A giant component survives while p·λπk² > 4.512.
  - Full connectivity needs roughly p·λπk² ≳ ln(pN) + c, plus the boundary allowance from the Section 3 table.
  - For uniform N = 1000 with 30% removed at random, the median M went from 0.0546 to 0.0662 (×1.18). That matches the uniform N = 700 calibration (≈ 1.72/√700 ≈ 0.065) **[own simulation]**.
- **Contiguous removal of about 30% of N = 1000 points; median M after removal with [5%, 95%] [own simulation, 120 reps]**:

| Base pattern | Removal mode | M before | M after | Median ratio |
|---|---|---|---|---|
| Uniform | random 30% | 0.0546 | 0.0662 [0.058, 0.081] | 1.18 |
| Uniform | one compact disc hole (300 nearest points to a random centre in [0.25,0.75]²) | 0.0549 | 0.0605 [0.051, **0.268**] | 1.03 |
| Uniform | many short capsules (length 0.1, half-width 0.02, each starting at a remaining point) | 0.0555 | 0.0731 [0.063, 0.092] | **1.33** |
| Uniform | one full-width band of width 0.3 | 0.0554 | 0.3051 [0.302, 0.311] | **5.54** |
| Thomas κ=25, σ=0.04 | random 30% | 0.1504 | 0.1571 [0.105, 0.246] | 1.04 |
| Thomas κ=25, σ=0.04 | disc hole | 0.1463 | 0.2043 [0.118, 0.403] | 1.27 |
| Thomas κ=25, σ=0.04 | capsules | 0.1466 | 0.1485 [0.100, 0.240] | 1.00 |
| Thomas κ=25, σ=0.04 | band | 0.1412 | 0.3085 [0.302, 0.336] | 2.23 |

- **Interpretation [own inference]**:
  - (i) An interior hole does not disconnect a 2D RGG, since paths route around it. Its heavy upper tail (95th percentile 0.268) comes from holes that reach the border and cut off a corner sliver.
  - (ii) A barrier spanning the region that is wider than k always disconnects it; M jumps to the barrier width.
  - (iii) Many small capsules create "Swiss-cheese" remnants: points left between strokes lose neighbours on several sides. For uniform points this is worse than random thinning at equal removed count.
  - (iv) For clustered points the bottleneck is already an inter-cluster gap. Random or within-cluster removal hardly matters (×1.00–1.04), but removing a whole cluster region widens gaps (×1.27).
- **Never-strand rules for algorithms [own inference; standard graph theory, sources not fetched]**:
  - A leaf of any spanning tree is never a cut vertex. Collecting points in post-order of a spanning tree of the current G_k never disconnects the remaining set. For example, use the EMST of the remaining objects rooted at the pile site the agent will finish at.
  - Capsule sweeps remove extra vertices, so each candidate stroke must be checked: recompute M, or test connectivity of G_k minus the swept set S, plus the destination pile. For N ≲ 2000 this is cheap with Delaunator, Prim, or a k-cell grid with BFS.
  - Articulation points of G_k can be found in O(V+E) by Hopcroft–Tarjan DFS, which flags points that must not be swept yet **[unverified citation details]**.
  - Piles are permanent stepping stones at original point locations, so placing pile sites deliberately can keep the agent's region connected.
  - Before sweeping a long swath, check that the union of swept capsules does not form a barrier wider than k between the agent and unvisited points, unless a pile is left inside the swath as a bridge.
- **Data-structure choice [own inference]**: polylog dynamic disk-graph connectivity structures (Kaplan et al.) are asymptotically attractive but complex. For N ≤ a few thousand, recomputing from scratch per stroke or per search node (O(N log N) or O(N²)) is simpler and fast enough. A decremental-only setting fits the game, since occupied locations only disappear (Section 5).

### Gaps
- I found no literature on exactly "an RGG under contiguous capsule-shaped removals" (raking swaths); the evidence is my own simulation.
- I did not verify the Holm–de Lichtenberg–Thorup fully dynamic connectivity bound (J. ACM 2001), the Hopcroft–Tarjan articulation-point citation, or Penrose's k-connectivity theorem in this session.
- The full author list and venue of the Berezin et al. and Shao et al. papers come partly from memory.
