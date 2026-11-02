# Pile placement, collection routing, and lower bounds for gathering N = n·t points into n piles

*Flags: **(V)** = checked this session (Oct 2026) against a fetched page or search-result abstract. **(U)** = from prior knowledge, not re-checked this session; verify DOI/pages before quoting. Everything under "Inferences" is my own derivation or judgment, not a sourced claim. Notation: points x_1..x_N in a region of area A, density ρ = N/A, d_ij = ‖x_i − x_j‖, reach k, capsule half-width l, n piles of exactly t points (N = n·t).*

## 1. Size-constrained / balanced / capacitated clustering: choosing n sites so each gets exactly t points

### Takeaway
For fixed centers, the exact-size assignment step is a transportation (min-cost-flow) problem whose LP always has an integral optimum. So "balanced k-means/k-median" means alternating an exact transportation assignment with a center update. Hungarian on replicated centers (Malinen & Fränti 2014) costs O(N³) per iteration and is impractical near N = 5,000 in a browser. A transportation/min-cost-flow solve with only n sinks, Sinkhorn on an N×n matrix, or ascent on n dual weights are the practical routes. Approximation theory for hard capacities is weak: every known constant-factor algorithm for capacitated k-median exceeds either the capacities or the number of centers by a factor (1+ε).

### Cited Findings
- **Bradley, Bennett & Demiriz, "Constrained K-Means Clustering," Microsoft Research Tech. Rep. MSR-TR-2000-65 (May 2000)** (V). Problem (3): minimize over C,T of Σ_{i=1..m} Σ_{h=1..k} T_{i,h}·(½‖x^i − C^h‖²), subject to Σ_i T_{i,h} ≥ τ_h for h = 1..k, Σ_h T_{i,h} = 1 for i = 1..m, and T ≥ 0, with Σ_h τ_h ≤ m. Algorithm 2.2 alternates an LP assignment step (4) with the update C^{h,t+1} = Σ_i T_{i,h} x^i / Σ_i T_{i,h}. Prop. 2.3 shows it terminates finitely at a local optimum where no single reassignment or center move lowers the objective. — [MSR TR-2000-65 (PDF)](https://microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2000-65.pdf)
- **Same report, min-cost-flow (MCF) form** (V). Each data point x^i is a supply node with b = 1. Each cluster C^h is a demand node with b = −τ_h. Arcs (x^i, C^h) cost ‖x^i − C^h‖². An artificial demand node a has b_a = −m + Σ_h τ_h, with zero-cost arcs C^h → a. Prop. 3.1: if every τ_h is an integer, an optimal T with all entries in {0,1} exists, because the flow is integral. The authors say network codes "usually run 1 or 2 orders of magnitude faster than general linear programming (LP) codes". The experiments were small: Ionosphere (351 points in R³³) and WDBC (683 points in R⁹), with CPLEX 6.0 doing the assignment. — [MSR TR-2000-65 (PDF)](https://microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2000-65.pdf)
- **Open-source descendant `k-means-constrained`** (J. Levy-Kramer) solves this flow with OR-Tools' C++ `SimpleMinCostFlow` and modifies the network to add maximum cluster sizes as well as minimums (V). — [GitHub joshlk/k-means-constrained](https://github.com/joshlk/k-means-constrained/)
- **Malinen & Fränti, "Balanced K-Means for Clustering," S+SSPR 2014, LNCS 8621, pp. 32–41, DOI 10.1007/978-3-662-44415-3_4** (V). The assignment step runs the Hungarian algorithm on n/k copies of each centroid, an N×N assignment problem, at O(n³) per assignment step. — [Springer](https://link.springer.com/10.1007/978-3-662-44415-3_4); description of the replication trick in [arXiv:2501.16113](https://arxiv.org/abs/2501.16113)
- **Malinen & Fränti, "Fixed-sized clusters k-Means," arXiv:2501.16113 (27 Jan 2025)** (V). It extends the method to arbitrary prescribed cluster sizes. The paper states "This makes the assignment phase time complexity O(n³)" and says the approach "enables clustering of datasets of size more than 5000 points". — [arXiv](https://arxiv.org/abs/2501.16113)
- **de Maeyer, Sieranoja & Fränti, "Balanced k-means revisited," Applied Computing and Intelligence 3(2):145–179 (2023), DOI 10.3934/aci.2023008** (V). Strictly balanced k-means is "impractically slow" at O(n³). Regularized k-means works when strict balance is mandatory but handles soft balance poorly. Their BKM+ starts by mostly minimizing variance, raises the weight on balance each iteration, and stops once a balance criterion is met. — [AIMS Press](https://aimspress.com/article/doi/10.3934/aci.2023008)
- **Luo & Mixon, "BalLOT: Balanced k-means clustering with optimal transport," arXiv:2512.05926 (v1 Dec 2025, v2 1 Oct 2026)** (V). An optimal-transport approach to alternating minimization. For generic data it yields integral couplings at every step, and it has exact and partial recovery guarantees under the stochastic ball model, plus initializations that give one-step recovery. — [arXiv](https://arxiv.org/abs/2512.05926)
- **Aurenhammer, Hoffmann & Aronov, "Minkowski-type theorems and least-squares clustering," Algorithmica 20:61–76 (1998), DOI 10.1007/PL00009187** (V). For any placement of the sites, some power diagram partitions an m-point set into clusters of prescribed sizes. Constrained least-squares assignments are equivalent to power diagrams, so they can be computed by finding suitable site weights. The planar algorithm takes about O(n²m) time and O(m) space, and a continuous version gives power diagrams with prescribed cell volumes. — [Springer](https://link.springer.com/doi/10.1007/pl00009187)
- **Capacitated k-median (CKM) approximation status** (V). Demirci & Li, "Constant Approximation for Capacitated k-Median with (1+ε)-Capacity Violation," ICALP 2016, DOI 10.4230/LIPIcs.ICALP.2016.73, arXiv:1603.02324, reach a constant factor while exceeding capacities only by 1+ε, using Li's configuration LP. They say this settles CKM for pseudo-approximation: exceeding either the cardinality or the capacities by 1+ε is enough for O(1). Earlier algorithms exceeded capacities by 2+ε. — [Dagstuhl LIPIcs](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ICALP.2016.73). Li, "On Uniform Capacitated k-Median Beyond the Natural LP Relaxation" (SODA 2015), opens ⌈(1+ε)k⌉ facilities instead of exceeding capacities. — [arXiv:1409.6739](https://arxiv.org/abs/1409.6739). Byrka, Rybicki & Uniyal give uniform CKM with 1+ε capacity violation via a configuration LP. — [arXiv:1511.07494](https://arxiv.org/abs/1511.07494)
- **Hardness** (U). Pyatkin, Aloise & Mladenović, "NP-hardness of balanced minimum sum-of-squares clustering," Pattern Recognition Letters 97:44–45 (2017). — [DOI](https://doi.org/10.1016/j.patrec.2017.05.033)
- **Assignment solvers** (U).
  - Hungarian algorithm: Kuhn (1955), Naval Res. Logist. Q. 2:83–97 — [DOI](https://doi.org/10.1002/nav.3800020109); Munkres (1957), J. SIAM 5(1):32–38 — [DOI](https://doi.org/10.1137/0105003).
  - Jonker & Volgenant (1987), "A shortest augmenting path algorithm for dense and sparse linear assignment problems," Computing 38:325–340 (LAPJV: O(n³) worst case, fast in practice, has a sparse variant) — [DOI](https://doi.org/10.1007/BF02278710).
  - Bertsekas (1988), auction algorithm, Annals of OR 14:105–123 — [DOI](https://doi.org/10.1007/BF02186476).
- **Seeding** (U). k-means++: Arthur & Vassilvitskii, SODA 2007, pp. 1027–1035, O(log k)-competitive in expectation. — [ACM DL](https://dl.acm.org/doi/10.5555/1283383.1283494)

### Inferences
- **Use the right objective.** Raking "work" is Σ mass × distance, which is linear. The matching model is capacitated k-**median** (Euclidean, unsquared). Bradley et al., Malinen–Fränti and BKM+ all optimize squared error (SSE). They are fine for initialization, but the MCF/transportation step accepts any arc cost, so plug in d_ij and replace the centroid update with a median update (see §2).
- **Exact sizes collapse Bradley's network to a pure transportation problem.** Setting τ_h = t for all h with N = n·t gives b_a = 0. Unit supplies, demands of t, and integrality all still hold.
- **Recommended browser pipeline for N ≈ 100–5,000** (judgment):
  1. Seed n sites, either with k-means++ or with a Hilbert-curve split (below).
  2. Solve the N×n transportation problem exactly with cost d_ij, using one of:
     - (a) successive shortest paths or network simplex on N + n nodes with candidate arcs only to each point's m ≈ 8–16 nearest sites. Then check every omitted arc's reduced cost against the duals (O(N·n)) and add any that are negative, which certifies global optimality;
     - (b) ascent on the n dual weights (§4), then a min-cost-flow cleanup to fix ties;
     - (c) Sinkhorn followed by rounding.
  3. Move each site to its cluster's discrete 1-median: the member point minimizing Σ distance, O(t²) per cluster, O(N·t) total.
  4. Iterate 10–30 times, then run size-preserving local search (§2).
- **Rough browser cost** (assuming about 10⁸–10⁹ simple typed-array operations per second; unverified). For N = 5,000 and n = 250:

  | Method | Order of work | Rough time |
  |---|---|---|
  | Hungarian on N×N | 1.25·10¹¹ | minutes to tens of minutes; impractical above ~1,500 points |
  | Dense transportation step | N·n = 1.25·10⁶ arc evaluations per pass | milliseconds per pass |
  | Sinkhorn | 1.25·10⁶ multiply-adds per iteration | 200–1,000 iterations in well under a few seconds, in a Web Worker |
  | Hilbert split | O(N log N) | under 10 ms |
- **1-D is exactly solvable and suggests a 2-D baseline.** On a line with linear (or any convex) cost, the Monge property means sorted points can be cut into consecutive blocks of exactly t, with each block's median point as its site. That is optimal in O(N log N); an exchange argument removes crossings. In 2-D, sort points along a Hilbert or other space-filling curve, cut consecutive blocks of t, and take discrete 1-medians. This gives a compact, exactly balanced, O(N log N) baseline and seed.
- **Theory versus practice.** The CKM constant-factor algorithms rely on configuration LPs and still exceed capacities, so they do not help an interactive tool. Use heuristics plus certified lower bounds (§2, §4) and report the gap.

### Gaps
- I could not open the full Malinen–Fränti (2014/2025) or BKM+ papers, so I have no runtime tables, dataset sizes or quality comparisons against min-cost flow.
- I did not verify any JS/TS library for min-cost flow, LAPJV or auction. OR-Tools' language support (I believe C++/Python/Java/.NET, no JS) was not checked.
- I did not verify the exact hardness statement in Pyatkin et al. (which k, which dimension). I found no result on the hardness of *exact-size* Euclidean k-median in the plane specifically.
- I did not verify Cohen-Addad–Li (ICALP 2019) or Adamczyk et al. (ESA 2019) on FPT approximations for capacitated k-median/k-means, or any PTAS-type results for capacitated clustering in low-dimensional Euclidean space.

## 2. Capacitated facility location and capacitated p-median (CPMP): formulations, Lagrangian/heuristic methods, and the mapping to n piles of exactly t

### Takeaway
Pile siting in this game is exactly a CPMP: the candidate sites are the input points themselves (a pile is founded on a point and only ever moves into another pile), demands are unit, capacities are uniformly t, and n·t = N, so every pile must be full. Relaxing the assignment constraints with Lagrange multipliers gives a lower bound that is trivial to evaluate here, because each site's knapsack subproblem reduces to "pick the t cheapest". It is also certifiably valid at every iteration, so it is the natural global lower bound for the benchmark.

### Cited Findings
- **Standard CPMP form** (formulation as used in the CPMP literature; U as to exact typography). Minimize Σ_i Σ_j q_j c_ij x_ij subject to: Σ_i x_ij = 1 for every j; Σ_j q_j x_ij ≤ Q_i y_i for every i; Σ_i y_i = p; x, y binary. Exact methods include column generation with Lagrangean/surrogate relaxation for lower bounds (Lorena & Senne) and branch-and-price compared against branch-and-bound on a Lagrangean relaxation (Ceselli 2003). — [IAOR record, likely Lorena & Senne](https://iaorifors.com/paper/46691); [UNIMI record, likely Ceselli](https://air.unimi.it/handle/2434/27113). Which link belongs to which paper is inferred from a search summary; the journal and page details for Lorena & Senne (believed Computers & OR 31(6), 2004) are U.
- **Stefanello, de Araújo & Müller, "Matheuristics for the capacitated p-median problem," ITOR 22(1):149–167 (2015), DOI 10.1111/itor.12103** (V). Local-search metaheuristics hybridized with MIP models solved by a MIP solver, using size reduction, tested on five instance sets. A 2025 SBPO paper uses it as a benchmark. — [vLex abstract](https://international.vlex.com/vid/matheuristics-for-the-capacitated-855661496)
- **Marathe, "A discrete equal-capacity p-Median problem," M.S. thesis, Virginia Tech (1992)** (V). This is the equal-capacity case with cost proportional to distance × amount. The method combines a mixed-integer formulation, dynamic programming on chain graphs, a heuristic upper bound, "a lower bound on the problem by solving a Lagrangian relaxation of a reformulated problem," a modified Benders' approach for the LP relaxation, and branch-and-bound over the location variables. — [VTechWorks](https://vtechworks.lib.vt.edu/handle/10919/46134?show=full)
- **Mulvey & Crowder, "Cluster analysis: an application of Lagrangian relaxation," Management Science 25(4):329–340 (1979)** (V). Subgradient optimization for lower bounds plus a simple search for upper bounds, for the uncapacitated p-median-type clustering model. — [RePEc](https://ideas.repec.org/a/inm/ormnsc/v25y1979i4p329-340.html)
- **Mulvey & Beck, "Solving capacitated clustering problems," EJOR 18(3):339–348 (1984), DOI 10.1016/0377-2217(84)90155-3** (V for the citation; method not verified). — [RePEc](https://ideas.repec.org/a/eee/ejores/v18y1984i3p339-348.html)
- **Classical heuristics** (U).
  - Teitz & Bart (1968), vertex-substitution (swap) heuristic for the p-median, Operations Research 16(5):955–961 — [DOI](https://doi.org/10.1287/opre.16.5.955).
  - Cooper (1963) location–allocation alternation, Operations Research 11(3):331–343 — [DOI](https://doi.org/10.1287/opre.11.3.331); Cooper (1972), "The transportation-location problem" (capacitated continuous sites with a transportation subproblem), Operations Research 20(1):94–108 — [DOI](https://doi.org/10.1287/opre.20.1.94).
  - Weiszfeld (1937), geometric-median iteration y ← Σ_j (x_j/‖x_j − y‖) / Σ_j (1/‖x_j − y‖); English translation by Plastria, Annals of OR 167:7–41 (2009) — [DOI](https://doi.org/10.1007/s10479-008-0352-z).
- **CPMP metaheuristics** (U).
  - Osman & Christofides (1994), simulated annealing and tabu search for capacitated clustering, ITOR 1(3):317–336 — [DOI](https://doi.org/10.1016/0969-6016(94)90032-9).
  - Ceselli & Righini (2005), branch-and-price for CPMP, Networks 45(3):125–142 — [DOI](https://doi.org/10.1002/net.20059).
- **Lagrangian theory** (U).
  - Geoffrion (1974), "Lagrangean relaxation for integer programming": if the subproblem has the integrality property, the Lagrangian dual equals the LP bound — [DOI](https://doi.org/10.1007/BFb0120690).
  - Geoffrion & McBride (1978), Lagrangean relaxation for capacitated facility location, with knapsack subproblems per facility — [DOI](https://doi.org/10.1080/05695557808975181).
  - Held, Wolfe & Crowder (1974), subgradient optimization with Polyak-type step sizes — [DOI](https://doi.org/10.1007/BF01580223).
- **Survey/book** (U). Laporte, Nickel & Saldanha da Gama (eds.), *Location Science*, Springer (2015; 2nd ed. 2019). — [DOI (1st ed.)](https://doi.org/10.1007/978-3-319-13111-5)

### Inferences
- **Exact mapping to the game.** I = J = all N points, q_j = 1, Q_i = t, p = n, and N = n·t, so each open site is exactly full (the capacity inequality becomes an equality). Add x_ii = y_i, since the founding point belongs to its own pile. Candidate sites are restricted to input points: a pile is founded on a point and only moves into other piles, so final pile locations are always original point locations.
- **Lagrangian lower bound (relax Σ_i x_ij = 1 with free multipliers λ_j):**

  `L(λ) = Σ_j λ_j + (sum of the n smallest ρ_i(λ))`, where `ρ_i(λ) = −λ_i + (sum of the t−1 smallest values of d_ij − λ_j over j ≠ i)`.

  - Every λ gives a valid lower bound on the optimal total distance (weak duality).
  - Subgradient: g_j = 1 − #{chosen sites whose t-set contains j}. Use a Polyak step θ = μ(UB − L)/‖g‖².
  - The subproblem's LP is integral: for fixed y it picks the t cheapest points, and the y-problem is "choose the n smallest". So max_λ L(λ) equals the LP bound of the strong formulation (Geoffrion).
  - Cost is O(N²) per evaluation with quickselect: 2.5·10⁷ operations at N = 5,000, about 50–100 ms in JS (rough), so 100–300 iterations fit in a Web Worker.
  - Valid pruning: sort each site's nearest neighbours by distance and take K of them; let Λ = max_j λ_j. Every omitted j satisfies d_ij − λ_j ≥ d_i,(K) − Λ. If the (t−1)-th smallest value in the list is ≤ d_i,(K) − Λ, the list is exact; otherwise extend it.
- **Closed-form special cases, cheap and valid:**
  - λ = 0 gives LB0 = the sum of the n smallest "t-nearest-neighbour stars" ρ_i(0) = Σ_{k=1..t−1} d_i,(k).
  - λ_j = nn_j (distance to the nearest other point) gives LB_nn = Σ_j nn_j − (sum of the n largest nn_j). Each non-site point must move at least nn_j, because its final pile sits on another point. LB_nn holds for *any* final pile sizes, which makes it useful when an algorithm ends with pile-size error.
- **Lagrangian heuristic (upper bound).** At each iteration take the n sites selected by the subproblem, solve the transportation problem on them (§1), and take a median re-site plus local search. This feeds UB into the step size.
- **Size-preserving local search.**
  - (i) Swap two points between neighbouring clusters when d(a, s_B) + d(b, s_A) < d(a, s_A) + d(b, s_B).
  - (ii) Re-median each cluster.
  - (iii) Teitz–Bart style site swap followed by a warm-started transportation re-solve.
- **Discrete versus continuous sites.** If the game ever allowed piles at arbitrary points, the continuous bound would be the relevant one. The cost of restricting to input points is at most 2× per cluster: if c* is the geometric median and p the member nearest to c*, then Σ_j‖x_j − p‖ ≤ Σ_j(‖x_j − c*‖ + ‖c* − p‖) ≤ 2Σ_j‖x_j − c*‖. In practice the cost is far smaller for dense clusters.
- **Caution for clustered fields.** With λ = 0, LB0 puts all n sites in the densest patches. Multipliers, which raise the price of points in sparse areas, are needed for a tight bound on mildly clustered data.

### Gaps
- I could not verify the methods inside Mulvey & Beck (1984), Lorena & Senne (2004) or Ceselli (2003) beyond abstracts and snippets. Their exact journal/page data and the typical LP/Lagrangian gaps on CPMP benchmarks were not checked.
- I found no source that measures CPMP lower-bound tightness specifically for *tight* uniform capacities (n·t = N) on random planar points. The bound's quality must be measured empirically in the simulator.

## 3. Capacitated vehicle routing and collection routing: what transfers to one raker with reach k

### Takeaway
The classic constructive Capacitated Vehicle Routing Problem (CVRP) heuristics map directly onto the raker's three-level decomposition:
- the sweep algorithm and cluster-first methods become polar or spatial partitioning into piles of t;
- the savings method becomes capacity-checked pile merging;
- route-first-cluster-second becomes "tour, then cut into blocks of t".

A real leaf-sweeping case study used exactly this decomposition: sweepers assigned to blocks, then bag deposit points, then truck routing. What has no CVRP analogue is the reach-k "never strand" constraint, which needs a connectivity invariant on the remaining objects.

### Cited Findings
- **Gillett & Miller, "A Heuristic Algorithm for the Vehicle-Dispatch Problem," Operations Research 22(2):340–349 (1974), DOI 10.1287/opre.22.2.340** (V).
  - The sweep algorithm groups locations into routes by polar angle, then iteratively reduces total distance. It is cluster-first, route-second.
  - Computation grows roughly linearly with the number of locations if the average number per route stays constant.
  - It generally beat Gaskell's savings results and was usually slightly better than Christofides–Eilon.
  - Later commentary reports results within 2–9% of best-known solutions on benchmarks.
  - Sources: [INFORMS](https://pubsonline.informs.org/doi/fpi/10.1287/opre.22.2.340); [RePEc](https://ideas.repec.org/a/inm/oropre/v22y1974i2p340-349.html)
- **Clarke & Wright, "Scheduling of Vehicles from a Central Depot to a Number of Delivery Points," Operations Research 12(4):568–581 (1964)** (U). Savings s_ij = d_0i + d_0j − d_ij: merge routes in decreasing order of savings while respecting capacity. — [DOI](https://doi.org/10.1287/opre.12.4.568)
- **Fisher & Jaikumar, "A generalized assignment heuristic for vehicle routing," Networks 11(2):109–124 (1981)** (U). Pick seed points, solve a generalized assignment problem (capacitated) using approximate insertion costs, then solve a TSP per cluster. — [DOI](https://doi.org/10.1002/net.3230110205)
- **Bramel & Simchi-Levi, "A location based heuristic for general routing problems," Operations Research 43(4):649–660 (1995)** (U). Chooses route seeds by solving a capacitated concentrator location problem, which is a capacitated facility-location clustering step. — [DOI](https://doi.org/10.1287/opre.43.4.649)
- **Route-first, cluster-second** (U). Beasley, Omega 11(4):403–408 (1983) — [DOI](https://doi.org/10.1016/0305-0483(83)90033-6). Prins (2004), giant-tour "Split" dynamic program, Computers & OR 31(12):1985–2002 — [DOI](https://doi.org/10.1016/S0305-0548(03)00158-8).
- **Bartholdi & Platzman, "An O(N log N) planar travelling salesman heuristic based on spacefilling curves," Operations Research Letters 1(4):121–125 (1982)** (U). — [DOI](https://doi.org/10.1016/0167-6377(82)90012-8)
- **Toth & Vigo (eds.), *Vehicle Routing: Problems, Methods, and Applications*, 2nd ed., MOS-SIAM Series on Optimization (2014)** (U). — [DOI](https://doi.org/10.1137/1.9781611973594)
- **Delle Donne, Di Tomaso & Durán, "Optimizing leaf sweeping and collection in the Argentine city of Trenque Lauquen," Waste Management & Research (online May 2020), DOI 10.1177/0734242X20922597** (V).
  - Integer linear programming models for (1) assigning sweepers to city blocks with full coverage and balanced workloads, (2) locating leaf-bag deposit points, and (3) truck pickup routes modelled as an asymmetric TSP.
  - Projected about half as many deposit points and 10–15% less truck travel. These are projections, not measured outcomes.
  - Its literature review cites Eglese & Murdock (1991), a road-sweeper routing program in rural NW England. The search result describes two decompositions in this context, cluster-then-route and route-then-split; I could not confirm which of the two papers each comes from.
  - Sources: [U. Chile repository](https://repositorio.uchile.cl/handle/2250/176108?show=full); [CONICET](https://ri.conicet.gov.ar/handle/11336/171402)
- **Waste collection and arc routing** (U).
  - Beltrami & Bodin (1974), municipal waste collection, Networks 4(1):65–94 — [DOI](https://doi.org/10.1002/net.3230040106).
  - Golden & Wong (1981), capacitated arc routing, Networks 11(3):305–315 — [DOI](https://doi.org/10.1002/net.3230110308).
  - Kim, Kim & Sahoo (2006), waste collection VRP with time windows, Computers & OR 33(12):3624–3642 — [DOI](https://doi.org/10.1016/j.cor.2005.02.045).
- **Arkin, Fekete & Mitchell, "Approximation algorithms for lawn mowing and milling," Computational Geometry 17(1–2):25–50 (2000)** (V). A (3+ε)-approximation for lawn mowing (covering a region with a moving cutter) and a 2.5-approximation for milling. — [Stony Brook record](https://researchconnect.stonybrook.edu/en/publications/approximation-algorithms-for-lawn-mowing-and-milling/)
- **Related routing models** (U).
  - Arkin & Hassin (1994), geometric covering salesman / TSP with neighbourhoods, Discrete Applied Math 55(3):197–218 — [DOI](https://doi.org/10.1016/0166-218X(94)90008-6).
  - Frederickson, Hecht & Kim (1978), stacker-crane problem (single-vehicle pickup-to-delivery moves; 9/5-approximation), SIAM J. Comput. 7(2):178–193 — [DOI](https://doi.org/10.1137/0207017).

### Inferences
- **Three-level decomposition, mirroring Delle Donne et al.:**
  - (L1) choose sites and an exact-t assignment (§1–2);
  - (L2) a per-pile stroke plan;
  - (L3) the agent's route across piles, which must be reach-k feasible.
- **Sweep transfers twice.**
  - (i) Globally: Gillett–Miller polar sweep gives balanced wedges, but for large n the wedges get long and thin, which is bad for mass×distance. Prefer Hilbert-curve blocks, or bands × angles.
  - (ii) Inside a cell: order points by polar angle around the site and, within each angular sector, rake the *farthest* point first. Its capsule (half-width l) then sweeps nearer points along the same spoke. Fully covering a disk-shaped cell of radius R this way needs about πR/l spokes, since the circumference 2πR is covered in widths of 2l. For sparse points it needs far fewer.
- **Savings becomes capacity-checked agglomeration.** Treat each tentative pile as a "route" with load equal to its size. Merge pairs in decreasing order of savings = (strokes + travel saved) − (extra work), subject to |A|+|B| ≤ t. Exact final sizes need a repair step (§5).
- **Fisher–Jaikumar / Bramel–Simchi-Levi become seeds = pile sites.** Their capacitated assignment is exactly our transportation problem, and their per-cluster TSP is the in-cell stroke order.
- **Route-first, cluster-second becomes "tour, then cut".** Build one tour (Hilbert order, then 2-opt). With exact sizes, Prins' Split is trivial: the cuts are every t points, leaving only t possible rotations. Pick the rotation that minimizes the sum of discrete 1-median costs, O(t·N·t) naively.
- **No CVRP analogue: stranding.** Let G_k be the k-disk graph on the current objects (loose points and piles). Strokes delete the selected and swept points from their positions. Piles persist as stepping stones and only disappear when merged.
  - Safe invariant: every remaining loose point lies in the agent's connected component of G_k.
  - Cheap check: before committing a stroke, run BFS or union-find on a grid-hashed G_k (cell size k, 3×3 neighbourhood), O(N) per candidate.
  - Safe order: peel the leaves of a spanning tree of G_k rooted at the planned final location (far to near). Removing tree leaves never disconnects the rest, because every connected graph with at least 2 vertices has at least 2 non-cut vertices.
  - If pile spacing is about √(A/n) > k, the piles alone cannot bridge cells. Keep "breadcrumb" loose points as bridges between cells and collect them last, retreating toward the final pile. Alternatively, add a "site graph connected at range k" constraint to siting, in the spirit of connected facility location (not researched here).
- **Stacker-crane analogy for travel.** Each stroke is a pickup-to-delivery move, so agent travel between strokes behaves like stacker-crane or dial-a-ride travel. Sweeps let one move service many points.

### Gaps
- Apart from Delle Donne et al., I found no OR literature on leaf collection itself, and in particular nothing on raking or sweeping objects into piles under a reach constraint. I also found no direct analogue of the "never strand" constraint in VRP. The closest ideas (connected facility location, exploration with limited range) were not researched.
- Eglese & Murdock (1991, JORS) details are known only through Delle Donne et al.'s citation.

## 4. Optimal transport / earth mover's distance: OT lower bounds on raking work and fast solvers that fit in JavaScript

### Takeaway
For any final pile configuration (sites S, each holding t), minimal work is at least the discrete Wasserstein-1 (EMD) cost between the N unit masses and the sites, because every point's path is at least its straight-line displacement. Minimizing over S gives back the CPMP of §2. Two practical tools follow:
- an *algorithm-specific* "OT to your own final sites" diagnostic, exactly computable as an N×n transportation problem;
- certified dual lower bounds that any approximate solver (dual-weight ascent, Sinkhorn) can produce cheaply.

### Cited Findings
- **Peyré & Cuturi, "Computational Optimal Transport," Foundations and Trends in Machine Learning 11(5–6):355–607 (2019), DOI 10.1561/2200000073** (U). The standard reference for discrete, entropic and semi-discrete OT, c-transforms and Sinkhorn. — [arXiv:1803.00567](https://arxiv.org/abs/1803.00567)
- **Cuturi, "Sinkhorn Distances: Lightspeed Computation of Optimal Transport," NeurIPS 2013** (U). Entropic OT with K = exp(−C/ε); iterate u ← a ⊘ (Kv), v ← b ⊘ (Kᵀu); P = diag(u) K diag(v). — [arXiv:1306.0895](https://arxiv.org/abs/1306.0895)
- **Altschuler, Weed & Rigollet, "Near-linear time approximation algorithms for optimal transport via Sinkhorn iteration," NeurIPS 2017, pp. 1961–1971** (V). Introduces Greenkhorn, a greedy coordinate variant with the same guarantees. Their Sinkhorn bound is Õ(n²/ε³), per Dvurechensky et al. — [arXiv:1705.09634](https://arxiv.org/abs/1705.09634)
- **Dvurechensky, Gasnikov & Kroshnin, "Computational Optimal Transport: Complexity by Accelerated Gradient Descent Is Better Than by Sinkhorn's Algorithm," ICML 2018, PMLR 80:1367–1376** (V). Improved Sinkhorn bound of Õ(n²/ε²) arithmetic operations. Their accelerated primal-dual method (APDAGD) achieves O(min{n^{9/4}/ε, n²/ε²}). — [PMLR](https://proceedings.mlr.press/v80/dvurechensky18a.html)
- **POT (Python Optimal Transport) documentation, `ot.lp`** (V). `ot.emd`/`ot.emd2` use the algorithm of Bonneel et al. (2011), which is network simplex: the `potentials_init` option is described as being "used to guide initial pivots in the network simplex". Default numItermax is 100000. Sparse cost matrices are allowed, with "Edges not included … treated as having infinite cost". `emd2_lazy` keeps memory at O(ns + nt) instead of storing the ns×nt cost matrix. `free_support_barycenter` follows Cuturi & Doucet (2014), Algorithm 2. — [POT ot.lp docs](https://pythonot.github.io/gen_modules/ot.lp.html)
- **Bonneel, van de Panne, Paris & Heidrich, "Displacement interpolation using Lagrangian mass transport," ACM TOG 30(6), SIGGRAPH Asia 2011** (V that POT uses it; DOI U). — [DOI](https://doi.org/10.1145/2070781.2024192)
- **Aurenhammer, Hoffmann & Aronov (1998)** (V). Prescribed-size clustering via power diagrams, with a continuous (prescribed-volume) version. This is the discrete-to-semi-discrete bridge (see §1). — [Springer](https://link.springer.com/doi/10.1007/pl00009187)
- **Balzer, Schlömer & Deussen, "Capacity-constrained point distributions: a variant of Lloyd's method," ACM TOG 28(3), Art. 86, SIGGRAPH 2009, DOI 10.1145/1531326.1531392** (V). A drop-in replacement for Lloyd's method in which every point is required to have the same capacity: its Voronoi area weighted by the density. The result is blue-noise point sets that adapt to the density. — [Uni Konstanz page](https://graphics.uni-konstanz.de/publikationen/Balzer2009CapacityconstrainedPoint/index.html)
- **Follow-up work** (V titles only). "Blue noise through optimal transport" (de Goes et al., SIGGRAPH Asia 2012) — [SIGGRAPH history](https://history.siggraph.org/?p=207999). "Centroidal power diagrams with capacity constraints" (SIGGRAPH Asia 2016) obtains capacity-constrained partitions as power diagrams under squared L2 — [SIGGRAPH history](https://history.siggraph.org/?p=210542)
- **Semi-discrete OT solvers** (U).
  - Mérigot (2011), multiscale OT, Computer Graphics Forum 30(5):1583–1592 — [DOI](https://doi.org/10.1111/j.1467-8659.2011.02032.x).
  - Lévy (2015), semi-discrete L2 OT in 3-D, ESAIM M2AN 49(6):1693–1715 — [arXiv:1409.1279](https://arxiv.org/abs/1409.1279).
  - Kitagawa, Mérigot & Thibert (2019), global convergence of damped Newton for semi-discrete OT, JEMS 21(9):2603–2651 — [arXiv:1603.05579](https://arxiv.org/abs/1603.05579).
- **k-means as OT** (U). Canas & Rosasco (2012), "Learning probability measures with respect to optimal transport metrics," NeurIPS: k-means is best approximation of the empirical measure by a k-point measure in W2. — [arXiv:1209.1077](https://arxiv.org/abs/1209.1077)
- **BalLOT** (V). Balanced k-means as OT-based alternating minimization with integral couplings. — [arXiv:2512.05926](https://arxiv.org/abs/2512.05926)

### Inferences
- **Validity of the OT bound in this game.** Two conditions are needed. (1) Final pile sites are original point locations. (2) Each point's charged work is at least its net displacement: a swept point charged from its original position, and pile drags charged as mass × drag length. Given both, the triangle inequality makes any multi-hop path at least the straight line. So actual work ≥ W1(S_final) := min over transportation plans to the algorithm's final sites ≥ min over all S = CPMP optimum ≥ Lagrangian bound L(λ) (§2). If the simulator instead charges swept points from their projection onto the stroke, subtract up to l per swept point, i.e. use max(0, d_ij − l). When an algorithm ends with pile-size error, compute W1(S_final) with its *actual* final pile sizes as the sink capacities; it then stays a valid lower bound on that algorithm's work. The exact-t Lagrangian bound does not apply to it, but LB_nn (§2) does.
- **Suggested benchmark decomposition.** Write actual work as `(actual / W1(S_final)) × (W1(S_final) / L(λ*)) × L(λ*)`.
  - The first ratio is "routing/hop inefficiency": detours, off-line relays, merges.
  - The second is "site-choice inefficiency", an upper bound on it since L ≤ OPT.
  - Report both ratios next to each algorithm.
- **Cheap certified bound for fixed sites (dual of the N×n transportation problem).**

  `D(w) = Σ_j min_i (d_ij − w_i) + t·Σ_i w_i ≤ W1(S)` for every w ∈ ℝⁿ.

  - D is concave and piecewise linear. A supergradient is g_i = t − #{j : argmin = i}.
  - Each evaluation is O(N·n). Ascent on the n weights converges fast in practice. At the optimum the argmin rule *is* the optimal assignment, up to ties fixed by a small min-cost-flow.
  - Any Sinkhorn output also gives a valid bound: take its site potentials as w, then c-transform (u_j = min_i(d_ij − w_i)), which makes them dual-feasible.
- **Geometry of the optimal cells (useful for stroke planning).**
  - With linear cost, the argmin rule d(x, s_i) − w_i gives additively weighted (Apollonius) cells, which are *star-shaped about their own site*. Proof: if x is in cell i and y lies on the segment [s_i, x], then ‖y − s_i‖ = ‖x − s_i‖ − ‖x − y‖ and ‖y − s_j‖ ≥ ‖x − s_j‖ − ‖x − y‖, so y is in cell i too. A straight drag from any assigned point to its site therefore never leaves its own cell; the capsule leaks only within l of cell boundaries.
  - With squared cost (power diagrams, Aurenhammer et al.) cells are convex, but a site can lie *outside* its own cell. That is one more reason to use linear cost for raking.
- **k-means as OT, for the report.** k-means = min over k-point measures ν with free weights of W2²(μ̂_N, ν). Balanced k-means fixes the weights to 1/k. The raking objective corresponds to W1 with weights fixed to t/N, i.e. balanced k-median.
- **JS solver choice for N ≤ 5,000, n ≤ ~500** (judgment).
  - Exact: transportation by successive shortest paths or network simplex with sparse candidate arcs plus a reduced-cost pricing check, or dual-weight ascent plus a min-cost-flow cleanup.
  - Approximate: log-domain Sinkhorn on the N×n kernel (Float64Array, about 1.25·10⁶ multiply-adds per iteration at 5,000×250) with ε-scaling, then rounding (Altschuler et al.) and min-cost-flow on the support.
  - Use POT offline (Python) as a reference oracle to unit-test the JS implementations.
- **Semi-discrete OT matters only for a continuum benchmark** (a density for the leaf field rather than samples). Computing Laguerre or Apollonius cells clipped to the region in JS is substantially more work than the discrete N×n problem, which is enough for the game.

### Gaps
- I did not check the exact Õ(·) statement in Altschuler et al.'s Theorem 1 (only the Dvurechensky et al. summary of it), nor POT's stated complexity for network simplex (the docs state none).
- I found no maintained, verified JavaScript OT, network-simplex or Sinkhorn library during this session.
- I did not verify the full author list and DOIs for de Goes et al. (2012) and the 2016 "Centroidal power diagrams with capacity constraints" paper.

## 5. Merging piles: cost models, merge trees, and when "small piles then merge" beats raking directly

### Takeaway
Under pure mass × straight-line-distance accounting, merging never reduces work, by the triangle inequality. It ties only when relay piles lie on the straight segment from each point to its final site. The benefits of merging lie elsewhere:
- the sweeping that pile drags pick up along the way;
- shorter agent travel;
- exact size control;
- being able to reach far sites at all when stroke length is limited.

Stroke count obeys an exact accounting identity that makes this explicit. Branched-transport theory (Gilbert–Steiner, cost mass^α × length) is the right conceptual frame for economies of scale: α = 1 is plain OT with no gain from branching, and α = 0 is the Steiner tree problem.

### Cited Findings
- **Branched (Gilbert–Steiner) transport** (V via abstracts). Network cost is ∫ θ^α over the network (θ = flow), with α in (0,1). α = 0 gives the Steiner problem and α = 1 recovers Monge–Kantorovich. Because (s₁+s₂)^α < s₁^α + s₂^α, flows merge into tree-like structures. The discrete model is due to Gilbert, with Lagrangian (Xia) and Eulerian (Maddalena–Morel–Solimini, Bernot–Caselles–Morel) continuum versions. — [Pegon, arXiv:1709.01414](https://arxiv.org/abs/1709.01414v1); [Marchese & Massaccesi, arXiv:1408.2406](https://arxiv.org/pdf/1408.2406)
- **Primary sources for branched transport** (U).
  - Gilbert (1967), "Minimum cost communication networks," Bell System Tech. J. 46(9):2209–2227 — [DOI](https://doi.org/10.1002/j.1538-7305.1967.tb04250.x).
  - Xia (2003), "Optimal paths related to transport problems," Commun. Contemp. Math. 5(2):251–279 — [DOI](https://doi.org/10.1142/S0219199703001026).
- **Ward, "Hierarchical grouping to optimize an objective function," JASA 58(301):236–244 (1963)** (U). Merging clusters A and B at their centroids raises the sum of squared errors by Δ(A,B) = (|A||B|/(|A|+|B|))·‖c_A − c_B‖². — [DOI](https://doi.org/10.1080/01621459.1963.10500845)
- **Huffman, "A Method for the Construction of Minimum-Redundancy Codes," Proc. IRE 40(9):1098–1101 (1952)** (U). Greedily merging the two smallest weights is optimal when a merge costs the combined size. This is the optimal-merge-pattern problem. — [DOI](https://doi.org/10.1109/JRPROC.1952.273898)
- **Dasgupta, "A cost function for similarity-based hierarchical clustering," STOC 2016** (U). cost(T) = Σ_{i<j} w_ij·|leaves(T[i∨j])|, where T[i∨j] is the subtree rooted at the lowest common ancestor of i and j. Top-down sparsest-cut splitting gives an approximation guarantee. — [arXiv:1510.05043](https://arxiv.org/abs/1510.05043)
- **Cohen-Addad, Kanade, Mallmann-Trenn & Mathieu, "Hierarchical Clustering: Objective Functions and Algorithms," J. ACM (2019)** (U). An axiomatic treatment of Dasgupta-type objectives, including the dissimilarity version. — [arXiv:1704.02147](https://arxiv.org/abs/1704.02147)

### Inferences
- **Merging never reduces work.** If set P is first raked to a relay pile at s and the relay is later dragged to the final site f, then:

  `Δwork = Σ_{j∈P} (‖x_j − s‖ + ‖s − f‖ − ‖x_j − f‖) ≥ 0`, with equality iff s lies on every segment [x_j, f].

  Relays should therefore sit on "spokes" toward the final site. Under the game's rule that a dragged pile goes into another pile, merging piles A and B costs min(|A|,|B|)·‖s_A − s_B‖ (smaller into larger). That is a linear-distance analogue of Ward's Δ in which the merged pile cannot move to a centroid.
- **Exact stroke accounting.** Let a founding be a non-stroke action, S the total number of loose points swept (not selected), and F the number of piles ever founded (F ≥ n). Every stroke removes one object (the selected point or pile) plus its swept points, and the game goes from N objects to n. Hence:

  `#strokes = (N − n) − S` and `#actions = (N − n) − S + F` (if foundings count as actions).

  Building extra intermediate piles costs exactly +1 founding each. It pays off in actions only if each extra pile leads to at least one extra swept point, for example a pile dragged along a corridor sweeps everything within l of the drag ("snowplow"), or if it saves enough agent travel.
- **When small-then-merge wins**, under a composite cost C = c_s·strokes + c_w·work + c_d·travel:
  - (i) **Stroke length is reach-limited.** If, say, the destination must be within k, then |stroke| ≤ 2k (since the start is within k as well), so points farther than 2k from their site *need* relays. Relays placed on the spoke cost no extra work.
  - (ii) **Sweeping density is high.** If ρ·2l·(drag length) ≫ 1, a pile drag sweeps many points, so S grows.
  - (iii) **Sizes must be exact.** Sweeping into a final pile can overshoot t unpredictably. Building sub-piles of known sizes and merging combinations that sum to exactly t (a small subset-sum) controls the size error.
  - (iv) **Travel is significant.** The agent can stay local while relays are dragged in a few long strokes.
- **Where the analogies fit.**
  - Gilbert–Steiner's θ^α is subadditive in mass, but the game's per-stroke cost is a fixed charge per object moved, not per edge. Every object still needs one pickup stroke or sweep, so stroke savings come *only* through S.
  - Huffman's optimal merge ignores geometry. With cost "moved mass × distance", a capacity-aware greedy agglomeration is a reasonable heuristic (merge the pair with the smallest min(|A|,|B|)·d among pairs with |A|+|B| ≤ t, repairing sizes at the end), but carries no optimality guarantee.
  - Dasgupta-type objectives score *trees* by similarity and are not a model of transport cost; at most they are a heuristic for picking which merges happen early.
- **The star tree is work-optimal**: rake every point straight to its final site. The interesting trade-off is purely between strokes (via sweeps), travel and size accuracy.

### Gaps
- I found no paper analysing this exact merge objective (moved mass × distance, smaller into larger, capacity exactly t, with capsule sweeping). This looks like a genuine gap; the cost model has to be studied in the simulator.
- I did not verify the specific approximation factors for Dasgupta-cost algorithms (sparsest cut, average linkage).

## 6. Lower bounds and baselines for agent travel and stroke count (MST, TSP/BHH, capsule coverage)

### Takeaway
A valid, cheap travel lower bound is the Euclidean MST with each edge shortened by 2r and clipped at zero, where r is the radius within which the agent must come of each point. Under the rule "selected object and destination both within k", r = k + l. BHH and MST constants give asymptotic baselines for uniform fields, and those baselines extend to clustered fields through ∫√f. For strokes, the identity strokes = N − n − S is exact. Its bounds come from capsule-capacity and packing arguments, which are weak when strokes can be long.

### Cited Findings
- **Beardwood, Halton & Hammersley, "The shortest path through many points," Proc. Cambridge Phil. Soc. 55(4):299–327 (1959)** (V for title/venue).
  - For N random points in a region of area A, the TSP length is almost surely about β√(N·A), with β independent of the region's shape.
  - For a non-uniform density f, L_N/√N → β∫f^{1/2} (this density version is U).
  - Sources: [Cambridge Core](https://www.cambridge.org/core/journals/mathematical-proceedings-of-the-cambridge-philosophical-society/article/shortest-path-through-many-points/F1C28B5730B94887F4659FCBF8A1F2BB); [DOI (U)](https://doi.org/10.1017/S0305004100034095)
- **Numerical value of β** (V).
  - Simulation estimates of β ≈ 0.7124 (Johnson, McGeoch & Rothberg 1996) and ≈ 0.7120 (Percus & Martin 1996) — [MathWorld](https://mathworld.wolfram.com/TravelingSalesmanConstants.html).
  - Best current estimates are 0.7119–0.7124 — [Theorem of the Day](https://www.theoremoftheday.org/OR/BHH/TotDBHH.pdf).
  - Normalization caveat: sources quote the constant under different normalizations. The ≈0.71 values are for L/√(N·A) in 2-D, the unit-square normalization (≈0.71 is also what Gaudio & Guan quote). Check the normalization before comparing.
- **Gaudio & Guan, "An Improved Upper Bound for the Euclidean TSP Constant Using Band Crossovers," arXiv:2602.11250 (Feb 2026)** (V).
  - Unit-square normalization: L_n/√n → β.
  - Earlier bounds: 0.625 ≤ β ≤ 0.92116 (BHH 1959); best lower bound 0.6277 (Gaudio & Jaillet); previous upper bound 0.90380 (Carlsson & Yu 2023). The new upper bound is **β ≤ 0.90367**.
  - They cite β ≈ 0.71 from Applegate, Bixby, Chvátal & Cook (2011).
  - Source: [arXiv](https://arxiv.org/abs/2602.11250)
- **Draganov, Edelsbrunner, Rosenmeier & Saghafian, "Expected Length of the Euclidean Minimum Spanning Tree and 1-norms of Chromatic Persistence Diagrams in the Plane," arXiv:2510.23373 (Oct 2025)** (V). For uniform points in the unit square, E[EMST] ~ c√n (Steele). The lower bound improves from 0.6008 (Avram & Bertsimas) to **0.6289 ≤ c**. — [arXiv](https://arxiv.org/abs/2510.23373)
- **Arkin, Fekete & Mitchell (2000)** (V). Lawn mowing and milling approximations: covering with a moving cutter, the continuous analogue of capsule sweeping. — [Stony Brook record](https://researchconnect.stonybrook.edu/en/publications/approximation-algorithms-for-lawn-mowing-and-milling/)
- **Penrose, "The longest edge of the random minimal spanning tree," Ann. Appl. Probab. 7(2):340–361 (1997)** (U). For N uniform points, N·π·M_N² − ln N converges to a Gumbel law, where M_N is the longest MST edge. This is the connectivity threshold of the random disk graph. — [DOI](https://doi.org/10.1214/aoap/1034625335)
- **Haenggi, "On distances in uniformly random networks," IEEE Trans. Inf. Theory 51(10):3584–3586 (2005)** (U). For a 2-D Poisson process of intensity ρ, πρR_k² ~ Gamma(k,1), so E[R_k] = Γ(k+½)/(Γ(k)√(πρ)), where R_k is the distance to the k-th nearest neighbour. — [DOI](https://doi.org/10.1109/TIT.2005.855610)

### Inferences

**Travel lower bound.** Suppose the agent must at some moment be within r of every point.
- **Proof.** Order the points by when they are first serviced, p_1, …, p_N. The agent's path is at least Σ_i max(0, ‖p_{i+1} − p_i‖ − 2r). The order is a Hamiltonian path, so this is at least the MST weight under w(e) = max(0, |e| − 2r). That transform is monotone, so the EMST edges stay optimal:

  `T ≥ Σ_{e∈EMST} max(0, |e| − 2r)`.

  The EMST takes O(N²) with Prim (~2.5·10⁷ operations at N = 5,000) or O(N log N) via a Delaunay triangulation.
- **Choosing r.** If the simulator requires the destination pile to also be within k of the agent, the whole stroke segment lies in the disk B(agent, k) by convexity, so swept points are within k + l: use r = k + l. If destinations are unrestricted, swept points can be arbitrarily far. Then apply the bound only to selected/founded objects with r = k, which is algorithm-specific (for example, over the algorithm's own n final sites).

**Feasibility diagnostics to report per instance.**
- Bottleneck b = the longest EMST edge. If every point must be selected or stepped on, b ≤ k is necessary.
- To generate solvable instances with N points at density ρ, choose k with πρk² ≥ ln N + c. By Penrose this gives connectivity with probability about exp(−e^{−c}): c = 3 gives about 0.95.
- Report k/b.

**Asymptotic travel baselines** (heuristic, uniform fields): a full tour ≈ 0.7124√(N·A); EMST ≳ 0.6289√(N·A) asymptotically.
- If the service radius r is large compared with the point spacing (ρr² ≫ 1), travel behaves like lawn mowing, about (A − πr²)/(2r) or less, since a path of length L sweeps area at most 2rL + πr².
- For mildly clustered fields, replace √A by ∫√f. A data-driven estimate is

  `∫√f ≈ √(π/N) · (Γ(κ)/Γ(κ+½)) · Σ_j R_κ(x_j)`,

  where R_κ is the distance to the κ-th nearest neighbour. This is unbiased for Poisson fields; with κ = 1 the TSP baseline is ≈ 1.425·Σ_j nn_j. All of this is my derivation.

**Work baselines** (heuristic, not certificates).
- An ideal tiling of equal-mass cells gives total work ≈ c·N·√(A/n). The mean distance to the centre for a unit-area cell is c ≈ 0.3761 for a disk, 0.3772 for a regular hexagon and 0.3826 for a square (computed this session by numerical integration; the square matches the closed form (√2 + ln(1+√2))/6).
- For finite t, the Poisson "t-nearest-neighbour star" has mean cost `E[ρ_i(0)] = (2/3)·Γ(t+½)/(Γ(t−1)·√(πρ))`, using Σ_{k=1..m} Γ(k+½)/Γ(k) = (2/3)·Γ(m+3/2)/Γ(m). For large t this tends to the disk value 0.3761·t·√(A/n) per pile.
- For a clustered density f, work ≈ 0.377·N·n^{−1/2}·∫√f. With the κ = 1 estimator above this is ≈ 0.754·√t·Σ_j nn_j.
- Hence LB_nn / baseline ≈ 1.33/√t. LB_nn is weak for large t, so the benchmark should prefer the Lagrangian bound of §2.

**Stroke bounds.**
- Exact: #strokes = N − n − S (§5).
- Capsule capacity, valid: with stroke length at most s_max (s_max = 2k under the "both within k" rule), every swept point is within s_max + l of the selected point. So #strokes ≥ ⌈(N − n)/M⌉ with M = max_p |B(p, s_max + l) ∩ P|, which grid hashing computes in O(N·neighbours).
- Packing, valid: a capsule has diameter s_max + 2l, so any set Q of points pairwise farther apart than s_max + 2l needs #strokes ≥ |Q| − n. A greedy grid packing finds such a Q.
- Expected sweep per stroke for uniform fields (heuristic): about ρ_loose·(2lℓ + πl²) for stroke length ℓ (the capsule area is exactly 2lℓ + πl²).
- Report sweep efficiency S/(N − n) as a primary metric.

**Benchmark menu.** Report each next to every algorithm's cost.

| Quantity | Valid lower bound? | Computation | Cost at N = 5,000 |
|---|---|---|---|
| LB_nn | yes, any pile sizes | from nearest-neighbour distances | O(N log N) |
| Lagrangian L(λ) | yes, exact sizes t | §2 subgradient | O(N²) per iteration, prunable |
| W1(own final sites) | lower bound on that algorithm's work | exact transportation, or dual D(w) as a certified bound | ~O(N·n) per pass |
| Travel bound | yes | Σ max(0, \|e\| − 2r) over EMST edges | O(N²) or O(N log N) |
| Stroke bounds | yes | capsule capacity and packing | O(N·neighbours) |
| Asymptotic baselines (0.377·N·√(A/n), 0.7124·√(NA), ∫√f versions) | no, context only | closed form / kNN sums | trivial |

Also report the ratios actual/W1(own) and W1(own)/L.

### Gaps
- I did not verify a reliable numerical estimate of the EMST constant (≈ 0.633 from memory). The new 0.6289 lower bound is verified, but no upper bound was checked.
- I did not verify Fejes Tóth's sum-of-moments ("hexagon") theorem, which would make the hexagon constant an asymptotic lower bound for continuous uncapacitated k-median under uniform density in convex regions with at most 6 sides. Its exact citation and conditions were not checked. Boundary effects and finite-t corrections for the baselines are also unquantified.
- I did not verify the density form of BHH or the exact conditions of Penrose's theorem (square versus torus).
- I found no literature on stroke-count lower bounds for capsule-shaped "rake" moves with long strokes. Covering points with capsules whose axes end at piles is a geometric set-cover variant; its LP lower bound may be strong, but it is likely too heavy for the browser and was not researched.
