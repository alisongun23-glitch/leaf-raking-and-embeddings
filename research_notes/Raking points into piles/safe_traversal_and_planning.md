# Safe Traversal and Planning for the Leaf-Raking Game: Graph Theory for Never Stranding, Constrained-Exploration Models, Search/Planning Algorithms, Hardness, and Benchmarking

Notation used throughout these notes: P is the set of the N original point locations. G_k(X) is the k-disk graph on a location set X, with an edge between two locations whenever their Euclidean distance is at most k. In the literature this is a unit-disk graph after rescaling. "Objects" means loose points plus piles. R is the set of *required* objects: loose points plus piles that are still unfinished. a is the agent's vertex. D is the set of vertices that a single action deletes. An item tagged **[unverified]** was not confirmed this session and should be checked before anyone cites it.

---

## 1. Graph theory for safe removal: non-cut vertices, connectivity-preserving elimination orders, articulation points, dynamic connectivity, and whether plain recomputation is fast enough for N ≤ 5,000

### Takeaway
Three facts settle this question:
- Every connected graph with at least two vertices has at least two non-cut vertices.
- An elimination order keeps the remainder connected at every step exactly when each removed vertex still has a neighbor that is removed later (or kept).
- Articulation points and biconnected components take one linear-time DFS to compute (Hopcroft–Tarjan).

At N ≤ 5,000, k-disk graphs have roughly 20k–100k edges. Recomputing from scratch on every decision is cheap enough for greedy and shallow lookahead. Polylog dynamic-connectivity structures (Holm–de Lichtenberg–Thorup; the disk-graph variants) are asymptotically attractive but heavy to implement and not needed at this scale.

### Cited Findings
- **Two non-cut vertices.** Any connected graph has a spanning tree, and a tree with at least two vertices has at least two leaves. A leaf of a spanning tree is never a cut vertex of G, because deleting it leaves a spanning tree of the remaining graph. So every connected graph with ≥2 vertices has ≥2 non-cut vertices. Sources: [Rutgers graph theory HW 6](https://sites.math.rutgers.edu/~jsb274/graphtheory/hw/hw6.pdf); [FIU course notes](https://faculty.fiu.edu/~ritterd/notes/graph/fall2004/pro5-8.pdf); [arXiv:1905.06459](https://arxiv.org/pdf/1905.06459).
  - An alternative proof picks a vertex farthest from a start vertex, which is the BFS "farthest-first" argument ([Towson notes](https://tigerweb.towson.edu/nmcnew/m451s18/notes/3-6.pdf)).
  - Corollary: a connected graph of order n has at most n−2 cut vertices ([Gustavus note](https://gustavus.edu/~max/courses/F2011/MCS-236/MaximumCutVertices.pdf)).
- **Hopcroft & Tarjan.** J. Hopcroft and R. Tarjan, "Algorithm 447: Efficient algorithms for graph manipulation," *Communications of the ACM* 16(6):372–378, June 1973, DOI 10.1145/362248.362272.
  - It partitions a graph into connected components, biconnected components, and simple paths.
  - Each algorithm uses time and space proportional to max(V, E). The biconnectivity algorithm is a DFS along the edges that also orients each edge.
  - Sources: [Princeton record](https://collaborate.princeton.edu/en/publications/algorithm-447-efficient-algorithms-for-graph-manipulation/); [CACM page](https://cacm.acm.org/research/algorithm-447-efficient-algorithms-for-graph-manipulation). JGraphT's `BiconnectivityInspector` implements this algorithm ([JGraphT docs](https://jgrapht.org/javadoc/org.jgrapht.core/org/jgrapht/alg/connectivity/BiconnectivityInspector.html)).
- **st-numbering.** S. Even and R. E. Tarjan, "Computing an st-numbering," *Theoretical Computer Science* 2(3):339–344, Sept 1976, DOI 10.1016/0304-3975(76)90086-4.
  - It gives a linear-time algorithm for an st-numbering of any biconnected graph.
  - The st-numbering itself comes from Lempel, Even & Cederbaum, who used it for planarity testing.
  - Sources: [Utah TCS bibliography entry](https://ftp.math.utah.edu/pub/tex/bib/idx/tcs1975/2/3/339_344.html); [Princeton record](https://collaborate.princeton.edu/en/publications/computing-an-st-numbering/).
  - The search also found a separate line of work on parallel ear-decomposition search and st-numbering, confirmed only at title level ([NJIT record](https://researchwith.njit.edu/en/publications/parallel-ear-decomposition-search-eds-and-st-numbering-in-graphs-2/)).
- **Holm, de Lichtenberg & Thorup (HDLT).** "Poly-logarithmic deterministic fully-dynamic algorithms for connectivity, minimum spanning tree, 2-edge, and biconnectivity," *JACM* 48(4):723–760, 2001; preliminary version at STOC 1998, pp. 79–89.
  - Secondary sources give its connectivity bound as O(log² n) amortized per update ([Princeton COS521 handout](https://www.cs.princeton.edu/courses/archive/fall09/cos521/Handouts/polylogarithmic.pdf); [BibSonomy entry](https://bibsonomy.org/bibtex/b97f78f55bc91df915b0ed235ab4b4ec)).
  - Wulff-Nilsen (SODA 2013) improved the deterministic amortized bound to O(log² n / log log n) ([arXiv:1209.5608](https://ar5iv.labs.arxiv.org/html/1209.5608)).
  - Public implementations exist, in C++ ([GitHub tomtseng/dynamic-connectivity-hdt](https://github.com/tomtseng/dynamic-connectivity-hdt)) and as the Python package `hdtgraph` ([PyPI](https://pypi.org/project/hdtgraph)).
- **Iyer, Karger, Rahul & Thorup.** "An experimental study of poly-logarithmic fully-dynamic connectivity algorithms," ALENEX 2000; *ACM Journal of Experimental Algorithmics* (2001), Article 4 ([University of Copenhagen record](https://test01.ku.dk/:obvius/pureproxy/3974268/en/publications/an-experimental-study-of-poly-logarithmic-fully-dynamic-connectiv-2)).
  - It tested HDLT variants against Henzinger–King. Running times were comparable, and with heuristics HDLT performed better ([2021 survey of fully dynamic graph algorithms, arXiv:2102.11169](https://arxiv.org/pdf/2102.11169)).
  - A 2025 paper claims the first comprehensive experimental study of all major data structures for dynamic-connectivity queries ([arXiv:2501.02278](https://arxiv.org/pdf/2501.02278v2)).
- **Dynamic connectivity in disk graphs.** Kaplan, Kauer, Klost, Knorr, Mulzer, Roditty & Seiferth, "Dynamic Connectivity in Disk Graphs," SoCG 2022 (LIPIcs SoCG.2022.49); journal version in *Discrete & Computational Geometry* 71(1), Jan 2024.
  - For unit-disk graphs: O(log² n) amortized update and O(log n / log log n) amortized query ([Dagstuhl](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SoCG.2022.49)).
  - A separate insertion-only structure for general disk graphs keeps the components in a disjoint-set-union structure, with o(n²) total time for n insertions ([arXiv:2306.15338](https://arxiv.org/html/2306.15338v1)).
- **EMST and Delaunay.** The Euclidean minimum spanning tree (EMST) sits inside a chain of geometric graphs: EMST ⊆ relative neighborhood graph ⊆ Urquhart graph ⊆ Gabriel graph ⊆ Delaunay triangulation. A planar EMST can be built in O(n log n) time via Delaunay ([Wikipedia: Euclidean minimum spanning tree](https://en.wikipedia.org/wiki/Euclidean_minimum_spanning_tree)).
- **Minimax ("frog", bottleneck) paths.** A minimax path between two vertices of an undirected graph is the path between them in the minimum spanning tree. In the Euclidean case, every path in the EMST is a minimax path. A linear-time single-pair widest/bottleneck path algorithm also exists for undirected graphs ([Wikipedia: Widest path problem](https://en.wikipedia.org/wiki/Widest_path_problem)).
- **Penrose 1997.** M. D. Penrose, "The longest edge of the random minimal spanning tree," *Annals of Applied Probability* 7(2):340–361, 1997, DOI 10.1214/aoap/1034625335 ([Project Euclid](https://projecteuclid.org/journals/annals-of-applied-probability/volume-7/issue-2/The-longest-edge-of-the-random-minimal-spanning-tree/10.1214/aoap/1034625335.full)).
  - Setting: n uniform points in the unit square.
  - With probability tending to 1, the MST's longest edge equals the nearest-neighbour graph's longest edge. So the known double-exponential (Gumbel) limit law carries over to the MST's longest edge.
  - The normalization nπM_n² − log n → Gumbel is recalled, not re-read; see Gaps.

### Inferences
- **Structural reduction: the game is vertex deletion on one fixed disk graph.** This holds under the stated rules: piles are founded *on points*, and every stroke or merge ends *in an existing pile*.
  - Then every occupied location at every moment is one of the N original locations, and the occupied set only shrinks. Founding relabels a vertex. A stroke deletes the selected object's vertex plus the swept loose points; the destination pile survives. A merge deletes the source pile's vertex.
  - The agent always stands on a current or former object location.
  - So the reach graph is always the induced subgraph G_k(P)[alive].
  - Implementation consequence: build a CSR adjacency (compressed sparse row: one offsets array plus one flat neighbor array) of G_k(P) once, using a uniform grid. Keep an `alive` Uint8Array. Every later connectivity question is a masked graph search on a static graph; no dynamic geometry is needed.
  - Because vertices are only ever deleted, a required object that loses its walking connection to the agent never regains it. Disconnection is an exact walking deadlock, with one exception: an island can still be collected remotely if a future stroke's capsule passes within l of it (Section 2).
  - If the simulator ever allows piles at arbitrary coordinates or free-standing agent positions, this reduction breaks and a geometric dynamic structure becomes necessary.
- **Exact characterization of safe elimination orders.**
  - Claim: an order v₁, v₂, …, v_m (with some retained set left at the end) keeps every intermediate remainder connected iff each vᵢ, at the moment it is removed, has a neighbor that is removed later or retained.
  - Proof sketch, by backward induction: G[{v_m,…}] is connected, and adding vᵢ, which has a neighbor in the remainder, keeps it connected. Conversely, a connected remainder with ≥2 vertices forces vᵢ to have such a neighbor.
  - Equivalently, the *reverse* of a safe order is a "connected ordering", in which every prefix induces a connected subgraph. So the following orders are all safe:
    - reverse BFS (farthest-first by hop distance from a chosen root);
    - reverse DFS or reverse Prim discovery order;
    - spanning-tree post-order ("leaf peeling").
- **"Rake from the parent."** Peel the leaves of a spanning tree T ⊆ G_k rooted at the intended final position.
  - The vertex being removed, v, is a leaf of the remaining tree. Its parent p is still alive and within k of v, because tree edges have length ≤ k.
  - So an agent standing on p can always select v, and it never strands, because the remainder stays connected and contains p.
  - A DFS Euler tour of T walks each tree edge twice, so agent travel is ≤ 2·w(T), where w(T) is the tree's total edge length.
  - If G_k(P) is connected, the EMST's longest edge is ≤ k (minimax property), so the EMST is a valid T. This is the classic MST double-tree bound transplanted to the game.
  - Caveat: the capsule swept by the drag from v to its destination can delete extra vertices; see Section 2.
- **Why naive nearest-first greedy strands itself.**
  - From its current spot the agent can only remove vertices one hop away, and near the agent those are often cut vertices. Example: an agent at the end of a chain whose only neighbor is the chain link.
  - Safe play therefore tends to work outside-in toward a chosen root, or else leaves persistent stepping stones (piles) behind.
  - The farthest-first argument says a vertex at maximum hop distance from the root is never a cut vertex. Its BFS parent is the natural place for the agent to stand.
- **st-orders give "two-sided" sweeps.** In a 2-connected component with an edge {s,t}, each internal vertex of an st-order has both a lower and a higher neighbor.
  - Removing vertices in increasing st-order therefore keeps both the remaining set and the cleared set connected.
  - This suits sweep-line clearing, where later capsules travel through already-cleared space and sweep nothing unintended.
  - For graphs that are not 2-connected, combine the per-block orders through the block-cut tree from Hopcroft–Tarjan.
- **Robust margin via 2-connectivity.**
  - If the remainder stays 2-connected, any single extra deletion (for example an unplanned capsule side effect) is safe.
  - Peeling the internal vertices of the last ear of an open ear decomposition keeps the graph 2-connected (Whitney's ear theorem **[unverified]**).
  - Guaranteeing safety for a capsule that deletes s points would need (s+1)-connectivity, which is usually unrealistic. Use the explicit set test in Section 2 instead.
- **Articulation points give O(1) single-vertex tests.** Run Hopcroft–Tarjan once per decision step on the alive subgraph. Removing v is safe iff any one of these holds:
  - v is not an articulation point; or
  - every block-cut-tree branch that v separates from the agent contains no required objects; or
  - those branches are deleted in the same action. Raking a whole dangling chain in one capsule is safe even though it removes a cut vertex.
- **Piles are persistent Steiner vertices.** Only loose points are swept. Piles disappear only through explicit pile strokes or merges.
  - So safety only requires R to stay in the agent's component. Finished piles act as free stepping stones.
  - **Sufficient "backbone" condition:** suppose the founded piles form a connected set in G_k and every remaining loose point is within k of some pile (a connected dominating set). Then every loose-point removal is safe, in any order and with any capsule side effects.
  - Corresponding strategy: found piles early at articulation or bridge sites, and defer merges.
  - Rough regime estimate: pile spacing ≈ √(t/ρ) and k ≈ √(d/(πρ)), where ρ = N/area and d = ρπk² is the mean neighbor count. A pile backbone forms naturally only when t ≲ d/π.
  - For typical t (10–50) at threshold-level d (≈10), piles are too sparse to be a backbone, so loose points must act as temporary stepping stones and removal order becomes critical.
- **Recomputation cost (my estimate; benchmark locally).** E ≈ N·d/2. With N = 5,000 and d between 8 and 40, E is 20k–100k.
  - One masked BFS/DFS or Hopcroft–Tarjan pass touches about N + 2E = 45k–205k typed-array entries. That is likely sub-millisecond to about 1 ms in a JIT-compiled JS implementation.
  - Greedy with about 10² candidate checks per step: about 10–100 ms per step, which is interactive.
  - Deep search (10⁴–10⁶ checks per decision) needs the local and offline techniques in Section 2.
  - Use an explicit-stack DFS. Recursion depth up to 5,000 may overflow some JS engines **[unverified, engine-dependent]**.
- **Don't implement HDLT or disk-graph dynamic connectivity here.** Deleting a vertex means deleting all its incident edges (d of them, roughly 10–40), each at polylog amortized cost with large constants. The process is also decremental-only on a static graph, which admits simpler tools: interleaved searches and offline reverse union–find (Section 2).
- **Critical k for random instances.** Applying Penrose's law (normalization recalled): P(G_k connected) ≈ exp(−e^{−α}) when the mean degree ρπk² ≈ ln N + α. For N = 5,000 in the unit square:

  | P(connected) | Mean degree ρπk² | k |
  |---|---|---|
  | 50% | ≈ 8.9 | ≈ 0.0238 |
  | 95% | ≈ 11.5 | ≈ 0.0270 |
  | 99% | ≈ 13.1 | ≈ 0.0289 |

  - Clustering raises the required k, because the largest inter-cluster EMST edge dominates.
  - Per instance, compute b = the EMST's longest edge (O(N log N) via Delaunay, or Kruskal over the static ≤k edge list) and report the slack k/b.
  - Bottleneck slack of the alive set during play: run Kruskal over the presorted static edge list restricted to alive endpoints. The largest edge needed to connect R is the current "frog distance". Its gap below k measures how close the agent is to stranding.

### Gaps
- Penrose's exact normalization (nπM_n² − log n → Gumbel) and any unit-square boundary effects were recalled, not read from the paper (the page fetch returned empty).
- **[unverified]**: Whitney's 1932 ear-decomposition theorem; Schmidt's 2013 chain-decomposition 2-connectivity test (*IPL* 113(7):241–244); the original Lempel–Even–Cederbaum 1967 paper; the later st-numbering simplifications (Ebert; Tarjan 1986; Brandes 2002); the Even–Shiloach 1981 decremental-connectivity details (*JACM* 28(1):1–4); Tarjan's 1975 union–find bounds (*JACM* 22(2):215–225); the HDLT biconnectivity bound.
- No source benchmarks HDLT against plain recomputation at about 5k vertices, or in JavaScript. All JS timing numbers above are estimates.

---

## 2. Removing a set at once: cheap tests that the disk graph plus the agent stays connected after a capsule sweep

### Takeaway
After deleting a set D from a connected graph, the rest is connected iff all surviving neighbors of D (plus the agent) lie in one component. This holds because every component of G − D must touch D's boundary.

That makes a cheap, exact test possible:
- run an early-exit, interleaved multi-source search on the static grid-built CSR graph;
- try a small local patch first, then fall back to a global search;
- verify whole plans offline with reverse-time union–find.

I found no paper that specifically covers connectivity under capsule-shaped deletions in disk graphs. The procedures below are derived from standard tools.

### Cited Findings
- Linear-time component and biconnected-component recomputation (Hopcroft–Tarjan, O(max(V,E))) is the exact baseline ([CACM](https://cacm.acm.org/research/algorithm-447-efficient-algorithms-for-graph-manipulation)).
- Disjoint-set union is the component structure in a state-of-the-art insertion-only disk-graph connectivity design ([arXiv:2306.15338](https://arxiv.org/html/2306.15338v1)). For unit-disk graphs, fully dynamic connectivity with O(log² n) amortized updates exists ([Dagstuhl SoCG 2022](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SoCG.2022.49)).
- The EMST lies inside the Delaunay triangulation and takes O(n log n) to build in the plane ([Wikipedia EMST](https://en.wikipedia.org/wiki/Euclidean_minimum_spanning_tree)). Every EMST path is a minimax path ([Wikipedia widest path](https://en.wikipedia.org/wiki/Widest_path_problem)). So the exact threshold at which any *static* point set becomes connected is the EMST's longest edge.
- Threshold-graph reasoning is a standard algorithmic pattern. Bottleneck-TSP heuristics, for example, pick the smallest θ at which the ≤θ subgraph is 2-connected ([Wikipedia: Bottleneck TSP](https://en.wikipedia.org/wiki/Bottleneck_traveling_salesman_problem)).

### Inferences
- **Boundary lemma.** Let H be connected and D a nonempty set of vertices, with H − D nonempty. Let B be the set of vertices outside D that have a neighbor in D. Then H − D is connected iff B lies inside a single component of H − D.
  - Proof: every component of H − D contains a vertex adjacent to D, otherwise H would be disconnected.
  - With persistent piles there is a relaxed form: accept the move iff every component of H − D that contains a required object is the agent's component. Components holding only finished piles may be cut loose.
  - If the agent stands on a vertex in D, treat its location as an extra member of B, connected to the alive objects within k.
- **Interleaved multi-source search (exact).**
  1. Start one BFS frontier from each b ∈ B and one from the agent, and advance them round-robin.
  2. Keep a small union–find over frontier labels and merge two frontiers as soon as they touch.
  3. Answer "safe" as soon as everything has merged into one front, or, in the relaxed form, as soon as every front that holds a required vertex has merged with the agent's front.
  4. Answer "unsafe" as soon as some front holding a required vertex runs out of unvisited vertices while still separate from the agent's front.
  - Cost: a "safe" verdict usually comes after a local exploration. An "unsafe" verdict costs about the size of the smaller separated piece.
  - This is the classic interleaving trick from decremental connectivity; attributing it to Even–Shiloach is **[unverified]**.
- **Local-then-global.** Restrict the search first to alive vertices within radius l + 2k of the capsule. If B is mutually connected inside that patch, the move is globally safe; local success is a sufficient condition. Otherwise, run the global interleaved search above.
  - Expected sizes for density ρ, stroke length L, and sweep half-width l:
    - |D| ≈ ρ(2lL + πl²);
    - the patch holds a few hundred points at threshold-level densities.
  - That suggests about 10⁴ operations, or tens of microseconds, per check (estimate).
- **Uniform-grid hashing.**
  - Cell side k: all neighbors of a point lie in the surrounding 3×3 cells. Use this to build the static CSR once and to answer capsule queries.
  - Cell side k/√2: every cell is a clique, since the cell diagonal equals k. A global recount can then union whole cells and only check point pairs between cells up to 2 cell-steps apart in each axis. Work becomes roughly O(#non-empty cells + cross-cell pairs) instead of O(E).
  - Capsule query: scan the cells overlapping the segment's bounding box inflated by l. Test each point with the squared point-to-segment distance, clamping the projection parameter to [0,1]. Use squared distances and one consistent ≤ rule to keep boundary cases deterministic.
- **Offline reverse union–find for full plans.** This applies when a planner (beam search, NRPA, a recorded game) has a complete deletion sequence.
  1. Process the sequence backwards, re-inserting vertices.
  2. Union each re-inserted vertex with its alive static neighbors.
  3. Keep a count of required vertices per root.
  4. At each step, check that the agent's root holds all of R.
  - The whole plan is verified in O((N+E)·α(N)), likely milliseconds at N = 5,000. This enables "generate a full candidate order, verify, repair at the first violation" planners.
- **Precompute articulation points once per step** (Section 1) to reject single-vertex removals in O(1). Run the set test only for multi-point capsules, or when D contains an articulation point whose separated side is not entirely inside D.
- **Check capacity in the same pass as connectivity.** The destination pile's new size is its old size plus the mass moved. If sizes must be exact, an overfull pile is permanent, since points cannot be un-raked. Run the overfill check alongside the connectivity check.
- **Remote collection of islands is the only escape from a connectivity deadlock.** A disconnected island can still be cleaned up if some future stroke segment, running from a selectable object to a pile, passes within l of every island point.
  - An exact test needs a search over stroke segments, so treat it as an optional heuristic.
  - Otherwise, flag disconnection of any loose point as a hard deadlock.

### Gaps
- No paper found on connectivity maintenance under geometric "capsule/hippodrome" deletions in disk graphs.
- **[unverified]**:
  - The k/√2 cell trick appears in grid-based DBSCAN work (e.g., Gan & Tao, SIGMOD 2015), not checked.
  - Local criteria for topology-preserving deletion in digital topology ("simple points") were not researched; they are a possible source of stronger local tests.
- No measured JS timings; all costs above are estimates.

---

## 3. Constrained-exploration models resembling the "always stay within k of something" rule

### Takeaway
The closest formal analogs are:
- **Fuel- or tether-constrained ("piecemeal") exploration:** the robot must periodically return to base; solved optimally in Θ(|E|) traversals.
- **Range-limited vehicles with refueling stations** (the gas-station problem): the feasibility graph is a threshold graph, just like G_k.
- **Connectivity maintenance in robot networks:** keep λ₂ > 0.
- **Bottleneck ("frog") paths:** governed by the EMST.
- **Vertex-deleting walks:** these collapse to Hamiltonian-path problems, which are NP-complete on grid graphs and therefore on unit-disk graphs. They become constructively solvable only with slack in the reach (k ≥ 3b), because the cube of a tree is Hamiltonian-connected.

No model found matches the game's mix of persistent piles plus involuntary sweeping. Persistent piles are exactly what makes the game easier than a Hamiltonian-path problem.

### Cited Findings
- **Piecemeal learning.** Betke, Rivest & Singh, "Piecemeal learning of an unknown environment," *Machine Learning* 18:231–254 (1995), DOI 10.1007/BF00993411 ([BU PDF](https://www.cs.bu.edu/fac/betke/papers/BetkeRivestSingh1995.pdf); [MLanthology](https://mlanthology.org/mlj/1995/betke1995mlj-piecemeal)).
  - The learner must return to its start every so often, for example to refuel.
  - The paper gives two linear-time algorithms, "wavefront" and "ray", for city-block graphs (grids with rectangular obstacles).
- **Piecemeal exploration of general graphs.** Awerbuch, Betke, Rivest & Singh, "Piecemeal graph exploration by a mobile robot," COLT 1995. It handles arbitrary undirected graphs using at most O(E + V^{1+o(1)}) edge traversals ([Princeton record](https://collaborate.princeton.edu/en/publications/piecemeal-graph-exploration-by-a-mobile-robot-2/); [Betke search summary](https://www.cs.bu.edu/fac/betke/papers/BetkeRivestSingh1995.pdf)).
- **Optimal constrained exploration.** Duncan, Kobourov & Kumar, "Optimal constrained graph exploration," *ACM Transactions on Algorithms* 2(3):380–402 (2006); preliminary version at SODA 2001 ([Arizona record](https://experts.arizona.edu/en/publications/optimal-constrained-graph-exploration/); [PDF](https://www.i2m.univ-amu.fr/perso/lionel.vaux/ens/imd-seminaire/Duncan.pdf)).
  - Two models: a tethered robot (a rope limits distance from the start) and a fuel-limited robot (must return after a fixed number of traversals).
  - The algorithm costs Θ(|E|), which is optimal, improving the previous O(|E| + |V| log²|V|). The two models are equivalent within constant factors.
- **Distance-constrained exploration, 2024.** A preprint, "Graph Exploration: The Impact of a Distance Constraint" (arXiv:2410.13386), shows that no algorithm can achieve a penalty linear in |V| on every graph for fuel-constrained exploration ([Emergent Mind summary](https://www.emergentmind.com/papers/2410.13386)).
- **Tethered coverage.** Shnaps & Rimon, "Online coverage by a tethered autonomous mobile robot in planar unknown environments," Robotics: Science and Systems IX, 2013.
  - Its TC algorithm is competitive, with path length ≤ 2(L/D)·l_opt ([RSS proceedings](https://roboticsproceedings.org/rss09/p07.html)).
  - A separate battery-powered coverage paper by the same authors appeared in *IEEE Transactions on Automation Science and Engineering* 13(2), 2016 ([researchr](https://researchr.org/publication/ShnapsR14-0)).
- **Gas-station problem.** Khuller, Malekian & Mestre, "To fill or not to fill: the gas station problem" (ESA 2007; a journal version exists).
  - A vehicle with limited tank capacity must route through refueling stations.
  - The point-to-point version is solvable in O(n²D log n) time for at most D stops; the tour version is NP-hard ([UMD project page](https://www.cs.umd.edu/projects/gas/); [UMIACS listing](https://www.umiacs.umd.edu/node/15254)).
- **Connectivity control.** Zavlanos, Egerstedt & Pappas, "Graph-theoretic connectivity control of mobile robot networks," *Proceedings of the IEEE* 99(9):1525–1540 (2011), DOI 10.1109/JPROC.2011.2157884 ([Duke Scholars](https://scholars.duke.edu/publication/742283)).
  - It covers centralized and distributed control that maintains connectivity of range-limited robot networks.
  - It uses λ₂ of the graph Laplacian (algebraic connectivity, the Fiedler value) as the measure of connectivity.
- **Online graph exploration.** Megow, Mehlhorn & Schweitzer, "Online graph exploration: New results on old and new algorithms," *TCS* 463:62–72 (2012); ICALP 2011 ([PDF](https://people.mpi-inf.mpg.de/~mehlhorn/ftp/GraphExploration.pdf); [ANU record](https://researchportalplus.anu.edu.au/en/publications/online-graph-exploration-new-results-on-old-and-new-algorithms-3/)).
  - Kalyanasundaram & Pruhs's ShortCut algorithm is 16-competitive on planar graphs. Megow et al. show it is not constant-competitive in general, but it is constant-competitive on bounded-genus graphs.
  - Nearest-neighbour (NN) exploration has best known ratio O(log n) on general graphs and 3/2 on cycles.
  - Learned-prediction "robustification" of NN appeared at AAAI-22 ([AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/21208/20957)).
- **Nearest-neighbour TSP tours.** Rosenkrantz, Stearns & Lewis, *SIAM J. Comput.* 6:563–581 (1977): NN tours are at most (½)⌈log₂ n⌉ + ½ times optimal.
  - Lower bounds: (1/6)log n (Johnson–Papadimitriou) and (1/4)log n (Hurkens–Woeginger).
  - Hougardy & Wilde show Θ(log n) even for Euclidean instances ([arXiv:1401.2071](https://arxiv.org/pdf/1401.2071)).
- **Hamiltonian paths in grid graphs.** Itai, Papadimitriou & Szwarcfiter, "Hamilton paths in grid graphs," *SIAM J. Comput.* 11(4):676–686 (1982), DOI 10.1137/0211056. Deciding Hamiltonicity of grid graphs is NP-complete ([MIT 6.890 lecture notes](https://courses.csail.mit.edu/6.890/fall14/scribe/lec8.pdf); [arXiv:2401.14963](https://arxiv.org/pdf/2401.14963)).
- **Cube of a graph.** The cube of any connected graph is Hamiltonian-connected: there is a Hamiltonian path between any two vertices (Karaganis, *Canad. Math. Bull.* 11 (1968) 295–296; Sekanina 1960).
  - Karaganis's proof recursively builds the path in the cube of a spanning tree ([arXiv:2206.02385](https://arxiv.org/pdf/2206.02385); [arXiv:2501.15716](https://arxiv.org/pdf/2501.15716)).
- **Bottleneck TSP.**
  - The square of any 2-vertex-connected graph is Hamiltonian (Fleischner).
  - This gives the Parker–Rardin 2-approximation: take θ, the smallest threshold at which the ≤θ subgraph is 2-connected, and square that subgraph. The resulting tour's edges are ≤ 2θ.
  - Parker & Rardin, *Operations Research Letters* 2(6):269–272 (1984), doi:10.1016/0167-6377(84)90077-4.
  - Ratio 2 is best possible for metric instances, and the problem stays NP-hard for Euclidean instances ([Wikipedia: Bottleneck TSP](https://en.wikipedia.org/wiki/Bottleneck_traveling_salesman_problem)).
- **Snake.** De Biasi & Ophelders, "The Complexity of Snake," FUN 2016, LIPIcs 49:11:1–11:13 ([Dagstuhl](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.FUN.2016.11)). Journal version: "The complexity of snake and undirected NCL variants," *TCS* 748:55–65 (2018).
  - Collecting all food is NP-hard on solid grid graphs and PSPACE-complete on general grid graphs.
  - Reconfiguration is PSPACE-complete even without food.
  - A 2025 paper lists NP membership of a snake problem on graphs as open ([arXiv:2506.21281](https://arxiv.org/pdf/2506.21281)).
- **Graph burning.** Bonato, Janssen & Roshanbin conjecture b(G) ≤ ⌈√n⌉ and proved b(G) ≤ 2⌈√n⌉ − 1. Land & Lu improved this to about (√6/2)√n ([arXiv:1511.06023](https://arxiv.org/pdf/1511.06023)). The asymptotic conjecture was proved by Norin & Turcotte in 2024 ([arXiv:2509.03144](https://arxiv.org/pdf/2509.03144)).

### Inferences
- **The game's constraint is "refuel at every object, range k".**
  - Gas-station analog: objects are stations, feasible hops are G_k edges, and walks are shortest paths in G_k (Dijkstra with Euclidean weights).
  - Piecemeal/tether analog: the "keep a short way home" invariant becomes "keep a path to all remaining work". The wavefront algorithms' habit of expanding outward while keeping return paths short corresponds to maintaining a spanning tree of the remaining work rooted near the agent.
  - The Θ(|E|) optimality results suggest that safe exploration costs only a constant factor over unconstrained exploration in graphs. Expect safety to cost moderate, not catastrophic, extra travel when k is comfortably above b.
- **Connectivity control** suggests a smooth safety margin: λ₂ of the local Laplacian, or simpler proxies such as the number of articulation points among required vertices, the presence of 2-connectivity, or bottleneck slack (Section 1). Use these as tie-breakers or heuristic penalties; hard safety comes from exact checks.
- **Vertex-deleting walk analog.** Suppose every point the agent visited were consumed and nothing persisted.
  - A full never-stranding sweep would then be a Hamiltonian path in G_k from the start. Grid graphs are unit-disk graphs at the lattice spacing, so this is NP-complete. That explains why "consume as you go" greedy fails unpredictably.
  - **Constructive positive result:** let b be the EMST's longest edge. If k ≥ 3b, every pair three EMST hops apart is within 3b ≤ k (triangle inequality), so G_k contains the cube of the EMST. By Karaganis/Sekanina, a single-pass never-stranding order exists between any chosen start and end, and the recursive proof yields it in about linear time.
  - If k ≥ 2θ₂ (θ₂ = the 2-connectivity threshold), a closed single-pass tour exists (Fleischner / Parker–Rardin).
- **Persistent piles allow backtracking.** They are what separates the game from the Hamiltonian case: the MST double-tree walk needs only k ≥ b, at the cost of revisits (travel ≤ 2·w(T)).
- **Nearest-first greedy** has Θ(log n) worst-case travel even on Euclidean instances (Hougardy–Wilde). Use it as a baseline wrapped with exact safety filters, not as a final algorithm.
- **Snake's hardness** (a self-blocking walker that collects everything) supports the view that "collect all without trapping yourself" is intrinsically hard in general. **Graph burning** is a spreading or covering process and only a weak analog.

### Gaps
- No paper found on a walker that consumes nodes while staying within k of remaining nodes *and* can create persistent depots (the game's exact model).
- **[unverified]**:
  - Generalized geography, a two-player vertex-deleting walk game (PSPACE-complete in the directed case; polynomial for undirected vertex geography via matchings); citations Schaefer 1978, Lichtenstein & Sipser 1980, Fraenkel–Scheinerman–Ullman 1993.
  - Lawn mowing and milling with a cutter of radius l (Arkin, Fekete & Mitchell, *Comput. Geom.* 17 (2000) 25–50), likely the closest analog of capsule coverage.
  - Connected-dominating-set / "virtual backbone" approximations in unit-disk graphs.
  - Cops-and-robbers analogs (not researched).
- **Bibliographic conflicts:**
  - A DBLP summary attributed the *IEEE T-RO* 30(4):966–974 (2014) tethered-coverage paper to Burdick & Rimon rather than Shnaps & Rimon; check IEEE Xplore.
  - The journal venue of the gas-station paper (believed *ACM TALG*, 2011) is unconfirmed.
  - The Awerbuch et al. journal version (believed *Information and Computation* 152(2), 1999) is unconfirmed.
  - The graph-burning venue is cited variously as LNCS 8882 (2014) and *Internet Mathematics* (2016).

---

## 4. Planning algorithms for irreversible combinatorial puzzles: what worked, and at what scale

### Takeaway
For single-player, irreversible, score-optimizing puzzles that lack a tight admissible heuristic, the documented winners are:
- **rollout-based searches** — SP-MCTS, Nested Monte Carlo Search, and NRPA;
- **memory-heavy beam search** with a good heuristic.

**Plain IDA* fails without a tight bound.** SameGame shows the gap: IDA* scored 22,354 points against 72,816–84,718 for the other methods.

**Domain engineering decides Sokoban:**
- IDA* with deadlock detection and macros solved 59 of the 90 XSokoban levels;
- feature-guided FESS solved all 90 in under 4 minutes total.

**Deep RL needs huge budgets and small instances.** It reaches 80–99% only on small procedural Sokoban levels (10×10, 4 boxes), after about 10⁹ environment steps on 900k training levels, and it degrades as boxes are added.

**Recommended stack for N ≤ 5,000 in JavaScript.** The game's horizon is hundreds to thousands of strokes, so full-game tree search is impractical at interactive speeds:
- a safe greedy baseline with exact checks;
- plan-then-repair;
- beam search over strokes;
- receding-horizon MCTS or NRPA on decomposed subproblems.

### Cited Findings
- **MCTS survey.** Browne et al. (10 authors), "A Survey of Monte Carlo Tree Search Methods," *IEEE Transactions on Computational Intelligence and AI in Games* 4(1):1–43, March 2012, DOI 10.1109/TCIAIG.2012.2186810 ([Maastricht record](https://cris.maastrichtuniversity.nl/en/publications/a-survey-of-monte-carlo-tree-search-methods); [IEEE Xplore](https://ieeexplore.ieee.org/document/6145622/footnotes)).
- **SP-MCTS.** Schadd, Winands, van den Herik, Chaslot & Uiterwijk, "Single-Player Monte-Carlo Tree Search," Computers and Games 2008, LNCS 5131, DOI 10.1007/978-3-540-87608-3_1 ([DOI](https://www.doi.org/10.1007/978-3-540-87608-3_1)). Journal version: Schadd, Winands, Tak & Uiterwijk, "Single-Player Monte-Carlo Tree Search for SameGame," *Knowledge-Based Systems* 34:3–11 (2012) ([PDF](https://dke.maastrichtuniversity.nl/m.winands/documents/KNOSYS_SameGame.pdf)). All facts in this bullet come from that PDF:
  - **Motivation.** The paper states that A*/IDA* fail without an accurate admissible evaluation function.
  - **Selection formula.** Pick the child maximizing v̄ᵢ + C·√(ln n_p / nᵢ) + √((Σr² − nᵢv̄ᵢ² + D)/nᵢ).
    - The third term measures the spread of scores observed under that child; a large D keeps rarely visited nodes attractive.
    - The top score is added to the average with weight W = 0.02.
    - The selection rule applies only after a node has 10 visits (T = 10).
    - The "exploitation" setting is (C; D) = (0.1; 32).
  - **Rollouts** use the domain policies TabuRandom and TabuColorRandom.
  - **Randomized restarts** (independent searches with different seeds) raise the average score. With a total of 5×10⁵ nodes, the best average came from ten searches of 5×10⁴ nodes each.
  - **Spreading search time across moves** beat building one big tree: +2,354 points.
  - **Parameters** were tuned with the Cross-Entropy Method.
  - **Time controls** were given as nodes in memory: 10⁵ nodes ≈ 20 s, 10⁶ ≈ 200 s, 5×10⁶ ≈ 1,000 s.
- **SameGame scale and results.** The 15×15, 5-colour board averages 62.2 moves per game with branching factor 21.1, a game-tree complexity of about 10⁸², and about 10¹⁵⁹ states ([KBS PDF](https://dke.maastrichtuniversity.nl/m.winands/documents/KNOSYS_SameGame.pdf)). Total scores on the 20-position standardized test set:

  | Method | Total score | Notes |
  |---|---|---|
  | IDA* | 22,354 | "human beginner level" |
  | Depth-Budgeted Search (Billings) | 72,816 | 2–3 h per position; greedy simulation at the depth budget |
  | SP-MCTS(1) | 73,998 | beat DBS on 11 of 20 positions |
  | SP-MCTS(2) | 76,352 | |
  | MC-RWS | 76,764 | 2 h limit |
  | Nested Monte Carlo Search | 77,934 | |
  | SP-MCTS(3) | 78,012 | CEM-tuned |
  | "spurious ai" (Simple Breadth Search) | 84,414 | beam search, multiprocessor, large memory |
  | HGSTS | 84,718 | GPU-parallel MCTS, tuned per position; not independently verified |

  - All SP-MCTS versions clear the board on all 20 positions.
  - The source is the same PDF.
- **Nested Monte Carlo Search.** T. Cazenave, "Nested Monte-Carlo Search," IJCAI 2009, pp. 456–461 ([IJCAI](https://ijcai.org/Abstract/09/083); [PDF](https://www.lamsade.dauphine.fr/%7Ecazenave/papers/nested.pdf)).
  - Nested levels of random playouts guide the search; it is designed for settings with no good heuristic.
  - Applied to Morpion Solitaire, SameGame, and 16×16 Sudoku.
  - In Morpion Solitaire 5D, NMCS found 80 moves against a best human score of 68 ([Cazenave & Teytaud, Beam NRPA](https://www.lamsade.dauphine.fr/~cazenave/papers/CazenaveBeam.pdf)).
- **NRPA.** C. D. Rosin, "Nested Rollout Policy Adaptation for Monte Carlo Tree Search," IJCAI 2011, pp. 649–654, doi:10.5591/978-1-57735-516-8/IJCAI11-115 ([PDF](https://cs.uwaterloo.ca/~jhoey/rgwiki/uploads/11IJCAI-NRPA-Rosin.pdf); [IJCAI](https://ijcai.org/Abstract/11/115)).
  - Each nesting level adapts its rollout policy by gradient ascent toward the best sequence found so far.
  - It set a Morpion Solitaire record (82 moves in the benchmark 5D version), beating a human record that had stood more than 30 years. A slide deck says 35 years ([U Toronto slides](https://www.teach.cs.toronto.edu/~csc2542h/fall/material/csc2542f16_P2_presentation.pdf)).
- **NRPA follow-ups.**
  - Beam NRPA matched the 82 and targets NRPA's tendency to get stuck in local optima ([PDF](https://www.lamsade.dauphine.fr/~cazenave/papers/CazenaveBeam.pdf)).
  - Stabilized NRPA reports gains, including on TSPTW ([arXiv:2101.03563](https://arxiv.org/pdf/2101.03563)).
  - NRPA was applied to the Traveling Salesman Problem with Time Windows: Cazenave & Teytaud, LION 2012, LNCS 7219, pp. 42–54 ([HAL](https://hal.archives-ouvertes.fr/hal-01406457); [PDF](https://www.lamsade.dauphine.fr/~cazenave/papers/tsptwnrpa.pdf)).
- **Rolling Stone (Sokoban).** Junghanns & Schaeffer, "Sokoban: Enhancing general single-agent search methods using domain knowledge," *Artificial Intelligence* 129(1–2):219–251 (2001) ([Alberta papers DB](https://papersdb.cs.ualberta.ca/~papersdb/view_publication.php?pub_id=831); [PDF](https://ai.dmi.unibas.ch/research/reading_group/junghanns-schaeffer-aij2001.pdf)).
  - Domain knowledge shrinks the search tree, often by several orders of magnitude per enhancement ([abstract summary](https://datalearner.com/academic/journal-papers/0004-3702/volumes-and-issues/247/paper-detail/1436)).
  - The enhancement ladder visible in the paper's figures: transposition table → move ordering → deadlock tables → tunnel macros → goal macros → goal cuts (and more) ([PDF](https://ai.dmi.unibas.ch/research/reading_group/junghanns-schaeffer-aij2001.pdf)).
  - Rolling Stone uses a lower bound on the number of pushes plus IDA* search, and solves 59 of 90 XSokoban levels ([Shoham & Elidan, arXiv:2105.01904](https://arxiv.org/pdf/2105.01904)).
- **Other Sokoban solvers** ([Shoham & Elidan](https://arxiv.org/pdf/2105.01904) for all counts):
  - Talking Stones, which computes a box packing order first and then executes it, solves 54/90.
  - Non-academic solvers Sokolution, Takaken, and YASS solve 81, 86, and 84 respectively, by the solver-statistics site's 10-minute criterion.
  - Solving all 90 stayed open for more than 20 years.
- **FESS.** Shoham & Schaeffer, "The FESS Algorithm: A Feature Based Approach to Single-Agent Search," IEEE Conference on Games (CoG) 2020, pp. 96–103, doi:10.1109/CoG47356.2020.9231929.
  - It projects states onto a smaller abstract feature space that guides the search ([FESS PDF](https://webdocs.cs.ualberta.ca/~jonathan/publications/ai_publications/fess.pdf)).
  - The authors report it as the first program to solve all 90 standard levels, in under 4 minutes total ([FESS PDF](https://webdocs.cs.ualberta.ca/~jonathan/publications/ai_publications/fess.pdf); [Festival solver site](https://festival-solver.site/)).
  - The PDF could not be re-fetched; these claims come from the search-result summary of the paper.
- **Forward-backward RL.** Shoham & Elidan, "Solving Sokoban with Forward-backward Reinforcement Learning," arXiv:2105.01904 (2021) ([arXiv](https://arxiv.org/pdf/2105.01904)).
  - Trained on only 155 Microban levels, it solves 88/90 XSokoban levels.
  - Without its backward-derived "hint" features it solves only 60.
  - Curriculum RL (Feng, Gomes & Selman, IJCAI-20, pp. 2198–2205) needed about 120 GPU-hours per new test level.
- **I2A.** Weber, Racanière et al., "Imagination-Augmented Agents for Deep Reinforcement Learning," arXiv:1707.06203 (later work cites it as Racanière et al. 2017) ([ar5iv](https://ar5iv.labs.arxiv.org/html/1707.06203)). All numbers below are from that paper, on 10×10 Sokoban with 4 boxes.
  - **Solve rates:**
    - I2A: 85% in one section, 87% elsewhere (the paper is internally inconsistent).
    - Standard model-free baseline: below 60%.
    - Larger baseline: 70%.
    - I2A with rollout length 15: above 90%.
    - I2A with Monte Carlo search over 10 retries: 95%.
  - **Compute versus MCTS:**
    - MCTS with a near-perfect model needed about 25k simulation steps per level to reach 87%, about 18× I2A's 1.4k model calls.
    - MCTS needed about 100k steps to reach 95%.
  - **Training:** about 1 billion frames.
  - **Generalization by box count** (agents trained on 4 boxes):

    | Boxes | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
    |---|---|---|---|---|---|---|---|
    | I2A (%) | 99.5 | 97 | 92 | 87 | 77 | 66 | 53 |
    | Standard (%) | 97 | 87 | 72 | 60 | 47 | 32 | 23 |
- **DRC.** Guez et al., "An Investigation of Model-Free Planning," ICML 2019 (PMLR 97:2464–2473) ([ar5iv](https://ar5iv.labs.arxiv.org/html/1901.03559); [MLanthology](https://mlanthology.org/icml/2019/guez2019icml-investigation)). Numbers are on Boxoban (10×10, 4 boxes):
  - **DRC(3,3):**
    - unfiltered test: 99% at 10⁹ steps (80% at 2×10⁷);
    - medium: 95%;
    - hard: 80% (DRC(9,1) solved 80% of hard levels in under 48 minutes).
  - **Baselines** (unfiltered, at 10⁹ steps): ResNet 96%, CNN 92%, I2A 84%, ATreeC 57%, VIN 56%.
  - **Levin Tree Search** with a DRC(1,1) policy prior solved 94% of hard levels but needed 10 hours of evaluation.
  - **Datasets:** 900k unfiltered train, 100k unfiltered test, 450k medium train, 50k medium test, 3,332 hard levels.
  - **Extra "thinking" steps:** about +5% on medium levels.
  - A 2024 replication reports gains from thinking time up to about 6 steps ([arXiv:2407.15421](https://arxiv.org/html/2407.15421v2)).
- **Levin Tree Search.** Orseau, Lelis, Lattimore & Weber, "Single-Agent Policy Tree Search With Guarantees," NeurIPS 2018 (arXiv:1811.10928) ([arXiv](https://arxiv.org/abs/1811.10928)).
  - Two methods: a policy-guided best-first search with an upper bound on node expansions, and a sampling variant with a bound on expected expansions.
  - Validated on 1,000 generated Sokoban levels, competitive with a state-of-the-art domain-independent planner.

### Inferences
- **The game's search profile.** Horizon ≈ N/s strokes, where s is the mean number of points per stroke: roughly 250–2,500 strokes at N = 5,000. Branching ≈ (selectable objects within k ≈ d) × (candidate destination piles), roughly 10²–10³.
  - That is 4–40× SameGame's 62-move horizon, at similar or larger branching.
  - Full-game MCTS/NRPA with complete rollouts is offline-only.
  - Rough timing (estimate): one greedy rollout of about 10³ strokes, with cheap-score pruning to about 10 safety checks per stroke at about 25 µs each, takes about 0.3 s.
  - **Interactive use therefore needs receding-horizon search:** decide the next 1–5 strokes, with rollouts truncated at 20–50 strokes plus a heuristic leaf value, at about 50–100 rollouts per second per Web Worker.
- **Recommended algorithm ladder.**
  1. **Safe greedy baseline.**
     - Rank candidate strokes by marginal cost per point collected.
     - Hard filters:
       - the exact connectivity invariant (Section 2);
       - capacity: no overfull pile, and the exact-t partition must stay feasible (subset-sum DP over pile sizes ≤ t, cheap for small t);
       - pile budget and merge range.
     - Tie-breaks: outside-in (remove vertices far from the chosen root or route), avoid articulation points, found piles on articulation or backbone sites.
  2. **Plan-then-repair**, in the spirit of Talking Stones' "packing order first":
     - choose n pile sites by capacitated clustering (groups of t);
     - compute a per-cluster leaf-peeling order rooted at each site;
     - verify the whole plan with reverse union–find (Section 2);
     - repair locally at the first violation.
  3. **Beam search over strokes**, width 8–128.
     - Score f = g + h with the lower bounds below.
     - Deduplicate with a transposition hash over (alive bitset, pile sizes, agent position).
     - Diversify with FESS-style feature buckets. Candidate features: completed piles, loose count, articulation points among R, bottleneck slack (k − frog distance), capacity slack, distance travelled.
     - Precedent: SameGame's best *verified* score (84,414) came from beam search ("Simple Breadth Search") with large memory.
  4. **SP-MCTS or NRPA, receding-horizon.**
     - SP-MCTS settings to carry over: safe-greedy rollouts, max-score backup (the W term), per-move time allocation, randomized restarts across Web Workers, and C/D rescaled to the game's cost range.
     - NRPA: encode moves as (selected-object id, destination-pile id) or as feature codes. Use Beam-NRPA or Stabilized NRPA against local optima. NRPA's record on routing-type problems (TSPTW) matches the game's collection-routing core.
  5. **Exact oracle for tiny instances.** IDA* or DP over alive masks for N ≤ about 12–16, to measure the heuristics' optimality gaps. Expect IDA* to be useless at scale, as in SameGame.
  6. **RL (optional).** A learned policy fits best as a rollout or expansion prior (LevinTS-style policy-guided search). As a primary solver, the Sokoban numbers imply very large training budgets and weak generalization to bigger instances.
- **Lower bounds for A*, beam search, and gap reporting.**
  - **Work bound.** Because pile sites are original point locations (Section 1), at most n points end with zero displacement. Every other point p moves at least d_NN(p), its nearest-other-point distance. So:

    LB_work = Σ_p d_NN(p) − (sum of the n largest d_NN values).

    This is admissible when work counts per-point straight-line or path displacement.
  - **Stroke bound.** LB_strokes ≥ ⌈(remaining loose points − foundings still possible) / c_max⌉, where c_max is the largest capsule capacity.
  - **Informative but inadmissible estimate.** Min-cost assignment of points to chosen pile sites with capacity t: Hungarian / min-cost flow for small instances, greedy for large ones. This is the analog of Rolling Stone's matching bound.
- **Deadlock taxonomy (Sokoban analogs).**
  - Connectivity deadlock: exact via graph checks.
  - Capacity deadlock: an overfull pile, or partial pile sizes that cannot be combined into exact t-sums.
  - Merge-range deadlock: more than n piles, with surplus piles not within k of a merge partner.
  - Stranded island: unreachable loose points.
  - Unlike Sokoban's precomputed deadlock tables, all of these are cheap to test exactly.
- **Macros** (Sokoban tunnel and goal macros): "chain rake" along a straight run of points; "found-then-fill" (found a pile, then rake its t−1 nearest points in a safe order).
- **Expect sampling methods to beat systematic search.** Weak bounds and long horizons with irreversibility match the regime where rollout-based search beat IDA* by about 3.5× in SameGame score.

### Gaps
- **[unverified]**:
  - Kocsis & Szepesvári, "Bandit based Monte-Carlo planning" (UCT), ECML 2006, LNCS 4212, pp. 282–293. The SP-MCTS paper confirms they proposed UCT; volume and pages are from memory.
  - Cazenave's Monte-Carlo Beam Search; Hart, Nilsson & Raphael (A*, 1968); Korf (IDA*, 1985). These are confirmed only as references inside the SP-MCTS paper.
- Not retrieved: FESS's internal feature list (PDF inaccessible); LevinTS's exact expansion-bound formula; any independent check of HGSTS.
- No published study found of MCTS, NRPA, or beam search on raking/sweeping/gathering puzzles.
- Typical empirical excess of nearest-neighbour tours on random Euclidean instances is not verified.

---

## 5. Hardness: complexity of planning with pushing and sweeping, to set expectations about optimality

### Takeaway
- **Sokoban** is NP-hard (Dor–Zwick) and PSPACE-complete (Culberson; Hearn–Demaine via NCL, even with no barriers).
- **Push-1 through Push-*, PushPush, and Push-X** are all NP-hard.
- **Related games:** SameGame/Clickomania are NP-complete; Snake is NP-hard to PSPACE-complete; Hamiltonian paths in grid graphs are NP-complete.
- **Expected class of the raking game:** probably NP-hard to optimize, but probably *not* PSPACE-hard. Every action is irreversible or bounded, so successful plays have polynomial length.
- **Practical consequence:** exact optimality only for tiny instances; heuristic search plus lower-bound gap reporting at scale.

### Cited Findings
- **Culberson.** "Sokoban is PSPACE-complete," University of Alberta Technical Report TR97-02 (1997), by reduction from linear-bounded automata ([ERA PDF](https://era.library.ualberta.ca/files/zw12z681d/TR97-02.pdf); [Culberson's page](https://webdocs.cs.ualberta.ca/~joe/Preprints/Sokoban/)).
- **Dor & Zwick.** "SOKOBAN and other motion planning problems," *Computational Geometry* 13(4):215–228 (1999).
  - Sokoban is NP-hard.
  - SOKOBAN(k,1) is NP-hard for every k > 5, even when the goal is only to move the porter to a target ([course copy of the PDF](https://ic.unicamp.br/~santiago/assets/mc558/2024%20-%202%20-%20projects/sokoban%20and%20other%20motion%20plannig%20problems.pdf)).
- **Hearn & Demaine.** "PSPACE-completeness of sliding-block puzzles and other problems through the nondeterministic constraint logic model of computation," arXiv:cs/0205005, listed as to appear in *TCS*.
  - Nondeterministic Constraint Logic (NCL) reverses edges in weighted directed graphs and generalizes Flake & Baum's Generalized Rush Hour Logic.
  - Sokoban is PSPACE-complete even without barriers.
  - Restricted Rush Hour is PSPACE-complete.
  - Unrestricted sliding-block puzzles are PSPACE-hard even when all pieces are dominoes.
  - Source: [arXiv](https://arxiv.org/abs/cs/0205005).
- **Pushing blocks.** Demaine, Demaine, Hoffmann & O'Rourke, "Pushing blocks is hard," *Computational Geometry: Theory & Applications* 26(1):21–36 (2003). It proves NP-hardness for Push-1 through Push-*, PushPush (blocks slide to their maximal extent), and Push-X (the path cannot revisit squares) ([Demaine's paper page](https://erikdemaine.org/papers/PushingBlocks_CGTA)).
  - The formal study began with Dhagat & O'Rourke (1992), who showed NP-hardness of Push-* with fixed blocks ([Pushing Blocks page](https://erikdemaine.org/pushingblocks)).
  - PushPush is NP-hard in 2D ([arXiv:cs/0001019](https://arxiv.org/abs/cs/0001019)) and in 3D ([arXiv:cs/9911013](https://arxiv.org/pdf/cs/9911013)).
- **SameGame.** It is NP-hard whatever its scoring function (Schadd et al. word it "at least NP-complete"); the proof shows that checking whether a given solution is optimal is already hard. Clickomania is NP-complete (Biedl et al., *More Games of No Chance*, MSRI Publications 42, pp. 389–404, 2002) ([KBS PDF](https://dke.maastrichtuniversity.nl/m.winands/documents/KNOSYS_SameGame.pdf)).
- **Snake:** NP-hard on solid grid graphs, PSPACE-complete on general grid graphs ([Dagstuhl](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.FUN.2016.11)).
- **Grid Hamiltonicity** is NP-complete ([MIT notes](https://courses.csail.mit.edu/6.890/fall14/scribe/lec8.pdf)).
- **Bottleneck TSP** is NP-hard even for Euclidean instances ([Wikipedia](https://en.wikipedia.org/wiki/Bottleneck_traveling_salesman_problem)).
- **Tour gas-station problem** is NP-hard ([UMD](https://www.cs.umd.edu/projects/gas/)).

### Inferences
- **Why the raking game is probably not PSPACE-hard.**
  - Each stroke either removes at least one loose point or removes a pile. Each founding turns a loose point into a pile.
  - So the game has at most about 2N irreversible actions, and the walk between actions can always be a shortest path.
  - Successful plays therefore have polynomial length, and a plan is a polynomially checkable certificate for integer objectives (stroke count, pile-size error). The decision versions of those objectives are in NP.
  - For Euclidean distance or work budgets, checking a sum of square roots against a threshold raises the known sum-of-square-roots issue, as in Euclidean TSP, so NP membership is not known.
  - Sokoban is different: reversible box motions allow exponentially long solutions, which is where its PSPACE-completeness comes from.
- **Likely NP-hard special cases** (sketches only, not proofs):
  - With exact sizes t, choosing the n pile sites and assignments to minimize work is a discrete capacitated n-median problem on the original points. Planar k-median is NP-hard (Megiddo–Supowit 1984 **[unverified]**).
  - Minimizing strokes with a large l resembles covering points with few capsules (geometric set cover).
  - With persistent piles banned, never-stranding coverage reduces to Hamiltonian path on a grid or unit-disk graph (Section 3).
  - By contrast, with n = 1 and the work objective, the optimum is the discrete 1-median over the N points, solvable by brute force in O(N²).
- **Expectations.**
  - No exact solver at N = 5,000.
  - Measure optimality gaps on tiny instances with an exact search, and against lower bounds (Section 4) at scale.
  - The Sokoban history (more than 20 years to solve 90 hand-made levels) suggests domain-specific pruning and abstractions will matter more than generic search.

### Gaps
- No hardness result exists for this exact rake game; all classifications above are unproven inferences.
- **[unverified]**: Euclidean TSP NP-hardness (Papadimitriou 1977, *TCS* 4(3)) and planar k-median NP-hardness (Megiddo & Supowit 1984, *SIAM J. Comput.* 13(1)).
- Not checked: hardness of covering points with capsules/hippodromes; the current PSPACE status of Push-1; whether Culberson's report also appeared at FUN 1998 (no such venue was found).

---

## 6. Benchmark methodology: metrics, paired comparisons across seeds, confidence intervals, performance profiles, and seeded reproducibility

### Takeaway
- **Instances:** compare algorithms on identical seeded instances (a paired design).
- **Outcomes to report:**
  - success and stranding with explicit failure modes;
  - strokes, travel distance, drag distance, and mass×distance work;
  - pile-size error;
  - runtime, both wall-clock and machine-independent counts.
- **Statistics:** Wilson-style intervals for rates, the Wilcoxon signed-rank test for paired cost differences, Friedman plus post-hoc tests for multiple algorithms (Demšar), stratified bootstrap confidence intervals with interquartile means (Agarwal et al.), and Dolan–Moré performance profiles, which must be read with Gould–Scott's caveats.
- **Stratification:** instance difficulty concentrates near the connectivity threshold, so stratify by k/b (slack) and t/d.
- **Seeding:** `Math.random` cannot be seeded, so use an explicit seeded PRNG with separate streams for instances and for algorithm randomness.

### Cited Findings
- **Performance profiles.** Dolan & Moré, "Benchmarking optimization software with performance profiles," *Mathematical Programming* 91(2):201–213 (2002), DOI 10.1007/s101070100263; arXiv:cs/0102001 ([arXiv](https://arxiv.org/abs/cs/0102001); [DOI](https://www.doi.org/10.1007/S101070100263)).
- **Profile caveats.** Gould & Scott, "A note on performance profiles for benchmarking software," *ACM TOMS* 43(2), Article 15 (2016), DOI 10.1145/2950048 ([CentAUR](https://centaur.reading.ac.uk/74694); [PDF](https://reading-9.eprints-hosting.org/74694/1/perform_toms.pdf)).
  - Profiles need careful interpretation when comparing several solvers.
  - Their proposed remedy: draw a sequence of profiles, dropping the best solver each time, until two remain.
  - Nested performance profiles are a follow-up remedy ([arXiv:1809.06270](https://arxiv.org/pdf/1809.06270)).
- **Statistical precipice.** Agarwal, Schwarzer, Castro, Courville & Bellemare, "Deep Reinforcement Learning at the Edge of the Statistical Precipice," NeurIPS 2021 (Outstanding Paper Award).
  - Point estimates from few runs mislead; report interval estimates.
  - Stratified bootstrap: resample runs within each task.
  - With only 3 runs, the confidence intervals underestimate the true 95% CI.
  - Interquartile mean (IQM): the mean of the middle 50% of runs, more robust than the mean and more statistically efficient than the median.
  - Software: the `rliable` library.
  - Sources: [arXiv:2108.13264](https://arxiv.org/pdf/2108.13264); [NeurIPS PDF](https://proceedings.neurips.cc/paper_files/paper/2021/file/f514cec81cb148559cf475e7426eed5e-Paper.pdf); [Google Research blog](https://research.google/blog/rliable-towards-reliable-evaluation-reporting-in-reinforcement-learning/?m=1).
- **Comparing algorithms across datasets.** Demšar, "Statistical Comparisons of Classifiers over Multiple Data Sets," *JMLR* 7:1–30 (2006) ([JMLR](https://jmlr.org/papers/v7/demsar06a.html)).
  - Recommends the Wilcoxon signed-ranks test for two methods.
  - For more methods: the Friedman test plus post-hoc tests, using Nemenyi for all pairwise comparisons and Bonferroni, Holm, or Hochberg for comparisons against a control.
  - Introduces critical-difference diagrams.
  - The Nemenyi test is criticized as very conservative.
- **Seeding in JavaScript.** MDN: the initial seed of `Math.random()` is chosen by the implementation and cannot be chosen or reset by the user. `Math.random()` is not cryptographically secure ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random)).
- **Benchmarking precedents from puzzle AI.**
  - SameGame uses a standardized 20-position test set plus an independent 250-position random set, with budgets stated in nodes and approximate seconds ([KBS PDF](https://dke.maastrichtuniversity.nl/m.winands/documents/KNOSYS_SameGame.pdf)).
  - The Sokoban solver-statistics site counts a level as solved if it is solved within 10 minutes ([Shoham & Elidan](https://arxiv.org/pdf/2105.01904)).
  - Boxoban separates unfiltered, medium, and hard difficulty splits with fixed train/test sizes ([DRC paper](https://ar5iv.labs.arxiv.org/html/1901.03559)).
  - The I2A level generator:
    - builds rooms with a random walk that turns with p = 0.35, for 1.5×(width + height) steps;
    - places boxes and targets randomly;
    - reverse-plays the level with DFS and scores it by BoxSwaps × ΣBoxDisplacement;
    - out of 40M generated levels, fewer than 0.7% repeated.
    - Source: [I2A paper](https://ar5iv.labs.arxiv.org/html/1707.06203).
- **Difficulty knob.** The longest MST edge of uniform random points follows a Gumbel-type law (Penrose 1997), so instance difficulty can be parameterized by k relative to the connectivity threshold ([Project Euclid](https://projecteuclid.org/journals/annals-of-applied-probability/volume-7/issue-2/The-longest-edge-of-the-random-minimal-spanning-tree/10.1214/aoap/1034625335.full)).

### Inferences
- **Metric definitions.** Fix these in the simulator spec and publish them.
  1. **Success:** all N points in exactly n piles of size t, with no stranding. Record the failure mode: stranded (nothing within k); unreachable work (some point in R disconnected); overfull pile; infeasible pile partition or count; timeout.
  2. **Stranding rate**, plus the step index at failure.
  3. **Strokes**, broken down into point strokes, pile drags/merges, and foundings.
  4. **Agent travel:** the sum of hop lengths between objects.
  5. **Drag distance:** the sum of stroke-segment lengths.
  6. **Work (mass×distance).** Choose one definition and state it:
     - (a) moved mass × stroke length; or
     - (b) per-point displacement to the destination, which has the clean lower bound Σ d_NN − (n largest).
     - Swept points travel less than the full segment, so (a) and (b) differ.
  7. **Pile-size error:** Σᵢ|sᵢ − t| (L1), maxᵢ|sᵢ − t|, and |#piles − n|.
  8. **Runtime:** wall-clock per decision and in total (`performance.now()`), plus machine-independent counters: nodes expanded, safety checks, rollouts.
  9. **Normalized cost:** cost ÷ lower bound (an upper bound on the optimality gap) and cost ÷ virtual-best, for profiles. Exact optima on tiny N give true gaps.
- **Instance design.**
  - Factors:
    - N ∈ {250, 1000, 5000};
    - slack k/b, or mean degree d = ρπk² relative to ln N (about 9–13 is the threshold band at N = 5,000);
    - l/k;
    - t, and the regime t/d;
    - cluster strength and boundary shape.
  - Sampling: a full factorial or a Latin hypercube design.
  - Add adversarial structured instances to exercise the safety logic: chains, single-point bridges, dumbbells, rings, and a star with a long arm.
  - Stratify every reported result by slack, because failures and gaps concentrate near k ≈ b.
- **Paired, seeded design.**
  - Run every algorithm on the same instance seeds (common random numbers) and analyze per-instance differences.
  - Use separate PRNG streams derived by hashing (instanceSeed → generator; algoSeed → algorithm), so that changing an algorithm's random draws never changes the instances.
  - Record the seeds, generator version, algorithm configuration, code hash, and JS engine version.
  - Make tie-breaking deterministic. JS `Map` and `Set` iterate in insertion order, which helps.
  - Avoid `Math.random` entirely.
- **Statistics.**
  - **Binary success:** a confidence interval per algorithm, and McNemar's test on discordant pairs between two algorithms.
  - **Zero observed failures** in n runs gives an approximate 95% upper bound of about 3/n ("rule of three").
  - **Paired costs:** Wilcoxon signed-rank test, plus a bootstrap CI on the median or IQM of per-instance cost ratios.
  - **Many algorithms:** Friedman test followed by Holm (against a baseline) or Nemenyi (all pairs), with critical-difference diagrams.
  - Report effect sizes, not just p-values.
  - Use thousands of instances; they are cheap here, which avoids the few-runs trap Agarwal et al. describe.
- **Profiles.**
  - Dolan–Moré cost-ratio profiles, with failures set to ∞, show the win rate at τ = 1 and the success rate as τ → ∞.
  - Because of Gould–Scott's caveat, also show pairwise profiles, or the drop-the-best sequence.
  - For anytime planners, plot quality against fixed per-decision budgets (e.g., 10 ms, 100 ms, 1 s), in the spirit of SameGame's budget reporting.
- **Simulator validation.**
  - Check invariants after every action: Σ pile sizes + #loose = N; every selection within k; capsule contents checked against a brute-force reference on random tests.
  - Keep replay logs, and regression-test saved instances as JSON.

### Gaps
- **[unverified]**: the original sources for Wilson score / Clopper–Pearson intervals, McNemar's test (1947), Holm's correction (1979), common random numbers (simulation texts such as Law & Kelton), and the rule of three.
- **[unverified]**: seeded PRNG options and their citations — PCG (O'Neill 2014), xoshiro128** (Blackman & Vigna, *ACM TOMS* 2021), sfc32, mulberry32.
- **[unverified]**: International Planning Competition quality-score rules (best-known cost ÷ planner cost, summed per instance), a candidate metric; Moré & Wild 2009 data profiles; Hoos & Stützle run-time distributions; Johnson's 2002 "Theoretician's Guide to the Experimental Analysis of Algorithms".
- **[unverified]**: whether Agarwal et al. also recommend "probability of improvement" as a statistic.
- **[unverified]**: cross-engine determinism of transcendental `Math` functions; basic IEEE-754 arithmetic is deterministic.
