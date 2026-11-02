# Geometric sweeping, lawn mowing, TSP with neighborhoods, coverage planning and pushing complexity: the problems closest to the leaf-raking game's mechanics

Game notation used throughout: N points, n piles of t points each (N = n·t), agent reach k (it may select or step onto objects only within distance k), rake half-width l (a stroke from a selected object to a pile captures every loose point within distance l of the stroke segment, i.e. inside a capsule of half-width l). "Inference" bullets are this researcher's reasoning, not literature claims. Theorem content is paraphrased with the exact constants. Verbatim quotation is kept to a minimum on purpose.

## 1. Dumitrescu & Jiang, "Sweeping points" (Algorithmica 2011) and follow-ups: model, cost measures, bounds, hardness

### Takeaway
Dumitrescu & Jiang (D&J) sweep points with an unbounded line (equivalently, a segment twice the set's diameter). The line moves orthogonally to itself and every point it touches rides along, with coinciding points merging. The cost is total sweep length, repositioning is free, and there are four variants: target a *hole* or a *pile*, *specified* or *freely chosen*. They give a √2-approximation in O(n) time and a 4/π ≈ 1.27-approximation in O(n log n) time, each using at most 4 sweeps (2 when the target is free). They also prove that length-optimal solutions can need 3n/2 − O(1) sweeps. The computational complexity is open: it is not even known whether optimal solutions need only polynomially many sweeps. A 2024 survey compendium still lists it as open. The only follow-ups found are a slanted-sweep variant for convex regions and a grid "line-push" model. I found no multi-target, short-broom, reach-limited or in-polygon variant.

### Cited Findings
- **Bibliography.** A. Dumitrescu, M. Jiang, "Sweeping points," *Algorithmica* 60(3):703–717 (2011), DOI 10.1007/s00453-009-9364-6. A preliminary version appeared at APPROX 2008, LNCS 5171, pp. 63–76. — [∃R compendium reference DJ11](https://arxiv.org/abs/2407.18006); [author copy, dated 28 Aug 2009](https://adriandumitrescu.org/sweep2.pdf); [DOI](https://doi.org/10.1007/s00453-009-9364-6)
- **Origin and motivation.** The question was posed by P. Żyliński: n balls lie on a table that has a hole at a specified point, and they must be swept into the hole with a line so as to minimize the total sweeping distance. The authors cite part feeding and nonprehensile manipulation as applications, for example a robot arm with a segment-shaped sweeping device that gathers small parts to a collection point. — [D&J author copy](https://adriandumitrescu.org/sweep2.pdf)
- **Exact model.**
  - A sweep places the line somewhere, moves it orthogonally and continuously to a parallel end position, then lifts it. All points touched move with the line.
  - Points can merge during a sweep, and merged points are treated as one point afterwards. Collinear points on a segment parallel to the sweep direction, between the initial and final line positions, end as one point.
  - A *sweeping sequence* moves all of S to a target point. Its cost is the total length of the sweeps, and positioning or repositioning the line costs nothing. The number of sweeps is a secondary parameter.
  - The infinite line can be replaced by a sweep segment of length 2·diam(S), as follows from their Theorem 3.
  - — [D&J author copy](https://adriandumitrescu.org/sweep2.pdf); [Dumitrescu & Jiang, oval paper, Intro](https://arxiv.org/abs/1101.4667)
- **Four variants.** The target is either a *hole* (a point that reaches it stays) or a *pile* (a point there can be swept away again), and it is either *constrained* (specified) or *unconstrained* (chosen by the algorithm). This gives CH, CP, UH and UP. The algorithms work for all four; the hole/pile distinction matters only for lower bounds. — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Lemma 1 (canonical sweeps).** Call a sweep canonical if the number of points in contact with the line stays constant during it. Any sweep sequence can be decomposed into canonical sweeps of the same total cost, with at most n canonical sweeps per original sweep. So an optimal canonical sequence exists. — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Theorem 1(I), algorithm A1, ratio √2 in O(n) time, at most 4 sweeps.**
  - Take axes with origin at the target o and the axis-parallel bounding rectangle Q of S ∪ {o}, of width w and height h.
  - Sweep top side → x-axis, bottom → x-axis, left → y-axis, right → y-axis. The cost is w + h.
  - First lower bound: OPT ≥ w, from the x-projections of the two x-extreme points. Each sweep moves only one of them closer to o.
  - Second lower bound: a sweep of cost x reduces the semi-perimeter (w + h) of the current enclosing rectangle by at most √2·x. Hence OPT ≥ (w + h)/√2.
  - — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Theorem 1(II), algorithm A2, ratio 4/π ≈ 1.27 in O(n log n) time, at most 4 sweeps.**
  - Compute the minimum-perimeter enclosing rectangle by rotating calipers, then run A1 in its frame.
  - Lower-bound proof: for each orientation θ, sweep i (length x_i, direction α_i) reduces the semi-perimeter of the orientation-θ enclosing rectangle Q(θ) by at most x_i(|cos(α_i − θ)| + |sin(α_i − θ)|) ≤ √2·x_i.
  - Summing over sweeps gives at least w(θ) + h(θ) ≥ 1, after normalizing the minimum semi-perimeter to 1.
  - Integrating over θ ∈ [0, π/2] gives 2 for every α_i. Hence 2·Σx_i ≥ π/2, so OPT ≥ π/4 while ALG = 1.
  - In the unconstrained variants the rectangle encloses S only. Only two sweeps are needed (top→bottom, left→right), with the target at the lower-right corner.
  - — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **How tight the 4/π analysis is.**
  - A2's ratio cannot be below ≈ 1.1784 in any variant. The value is 3/(6·arctan(1/2) − √5 + 2), from a smoothed obtuse-isosceles convex curve whose minimum enclosing-rectangle semi-perimeter is constant over a range of orientations.
  - A simpler example: three vertices of a unit equilateral triangle with the target at its centre. OPT = √3 using 3 sweeps, while the four-sweep algorithm costs 1 + √3/2, a ratio of about 1.077.
  - — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Theorem 2 (many sweeps).** In the constrained variants CH and CP, for every n ≥ 3 there are n-point sets whose every optimal (minimum-length) sweeping sequence has at least 3n/2 − O(1) sweeps.
  - Construction: a unit equilateral triangle ABC, n − 3 extra points on edge BC, and the target at B.
  - OPT = √3. The lower bound comes from a Steiner-tree argument: the trajectories of A, B and C form three paths to a common point, so their total length is at least the Steiner tree length √3.
  - Any optimal sequence uses only three special sweep types and must merge the extra points one by one, alternating sweep types.
  - The construction extends to an infinite set with finite optimal cost √3 that needs infinitely many sweeps.
  - — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Theorem 3 (worst case over unit-diameter sets, free target).** Define ϑ_H and ϑ_P as the supremum over unit-diameter sets of the optimal cost, for UH and UP. Then √3 ≈ 1.73 ≤ ϑ_H ≤ ϑ_P ≤ 2.
  - The upper bound: two sweeps of an enclosing 1 × (≤1) rectangle.
  - The lower bound: the Steiner tree of an equilateral triangle.
  - Conjecture 1: ϑ_H = ϑ_P = 2, attained in the limit by n points evenly spaced on a circle. Theorem 1 alone gives only π/2 for that example.
  - — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Open questions D&J pose.** What is the computational complexity for n points? It was not clear to them that any computable upper bound on the number of sweeps exists, or even that the problem is decidable. They also ask whether there is a polynomial-time exact algorithm, and whether some optimal solution always uses polynomially many sweeps. — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Still open as of 2024.** The ∃R compendium (Schaefer, Cardinal, Miltzow) lists "Sweeping Points" as open problem CG-Open26. The decision version asks, for a finite rational P and a bound ℓ, whether all points can be swept to the origin with total sweep length at most ℓ. The listed open question is whether shortest solutions always use polynomially many sweeps. — [∃R compendium, arXiv 2407.18006](https://arxiv.org/abs/2407.18006)
- **Follow-up: slanted sweeps (CCCG 2010).** Y. Bousany, M. L. Karker, J. O'Rourke, L. Sparaco, "Sweeping minimum perimeter enclosing parallelograms: optimal crumb cleanup," CCCG 2010, pp. 167–170.
  - The line may translate by any vector v, not only one orthogonal to it, at cost |v|. Points are assumed to have enough friction not to slide along the line.
  - Planar connected regions replace point sets.
  - For a convex n-gon they compute a minimum-perimeter enclosing parallelogram in linear time, and hence the optimal 2-sweep sequence. They conjectured that 2 sweeps are optimal for convex regions.
  - — [as described in Dumitrescu & Jiang, arXiv 1101.4667](https://arxiv.org/abs/1101.4667)
- **Follow-up: "Sweeping an oval to a vanishing point."** A. Dumitrescu, M. Jiang, *Discrete Applied Mathematics* (2011), DOI 10.1016/j.dam.2011.05.003; arXiv 1101.4667. Results, all in the slanted model:
  - **Theorem 1.** Some convex regions have an optimal 2-sweep sequence that is not optimal overall: the Reuleaux triangle, the disk, and a specific isosceles trapezoid. This disproves the Bousany et al. conjecture.
  - **Corollary 1.** For every n ≥ 4 there are such convex n-gons.
  - **Lemma 1.** For every side s of a convex polygon P, the sweeping cost of P is at most per(P) − |s|, using n − 1 sweeps along a triangulation fan.
  - **Theorem 2 and Corollary 2.** Both A2 and the minimum-perimeter-parallelogram 2-sweep algorithm are 4/π-approximations.
  - **Lower bounds on the parallelogram algorithm's ratio.** 1.0715 is proven. About 1.0784 = 1/(2·arctan(1/2)) depends on a claim the authors only suspect.
  - **Conjecture 1.** Some convex regions, such as a thin circular cap, have no finite optimal sweeping sequence.
  - **Correction to the 2011 analysis.** The authors note they had overlooked that no finite optimal sequence may exist; the fix is an ε correction.
  - **Open.** Whether the 2-sweep conjecture holds for triangles.
  - — [arXiv 1101.4667](https://arxiv.org/abs/1101.4667); [Semantic Scholar citation record](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1007/s00453-009-9364-6?fields=title,abstract,venue,year,externalIds,citations.title,citations.year,citations.venue,citations.externalIds)
- **Follow-up: line pushes on a grid, no merging.** H. A. Akitaya, M. Löffler, G. Viglietta, "Pushing Blocks by Sweeping Lines," FUN 2022 (LIPIcs 226, paper 1, DOI 10.4230/LIPIcs.FUN.2022.1); journal version in *Computing in Geometry and Topology* (2023).
  - **Model.** Tokens sit on the square grid. A push from one of the four cardinal directions moves the first-hit tokens one unit and displaces tokens in their way. Tokens never merge.
  - **Theorem 8.** Every *sparse* configuration (no two tokens in a row or column) of n = ab tokens can be pushed into an a×b box exactly when a ≤ 2, b ≤ 2, or a = b = 3.
  - **Labeled tokens.** The reachable permutations form the alternating group (with exceptions). When a permutation puzzle is solvable, the authors claim a solution with O(n⁴) pushes.
  - **Related work they cite.** Trash compaction (Akitaya et al., EuroCG 2016) is NP-complete in general and polynomial for 2×k boxes with k constant.
  - — [arXiv 2202.12045](https://arxiv.org/abs/2202.12045); [LIPIcs](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.FUN.2022.1); [CGT journal](https://cgt-journal.org/index.php/cgt/article/view/31)
- **Citation footprint.** Semantic Scholar indexes only five citing works of "Sweeping points": the CCCG 2010 slanted-sweep paper, the oval paper, and three unnamed repository records. That points to very little follow-up. — [Semantic Scholar record](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1007/s00453-009-9364-6?fields=title,abstract,venue,year,externalIds,citations.title,citations.year,citations.venue,citations.externalIds)

### Inferences
- **Closest D&J variant.** Our game matches **UP** most closely: a pile, free location, and piles that can be re-raked.
- **How our rake differs from a D&J sweep:**
  - It is a *bounded* broom of width 2l, with round caps, that moves along its own normal.
  - Captured points *collapse into the destination pile*. In D&J they end spread along the final line position and merge only if collinear along the sweep direction.
  - Each stroke must start at an object within k and end at an existing pile.
  - Repositioning (agent travel) has a cost and must use ≤k hops.
  - So D&J is not literally a limit of our game. Letting l → ∞ makes our game trivial, since one capsule would swallow everything. D&J corresponds to a broom of unbounded length perpendicular to its motion, capturing only the strip it sweeps.
  - Their 4/π two-sweep algorithm is therefore best used as a "very long rake, free repositioning" sanity baseline, not as a competitor.
- **Free extra lower bound for line sweeps (my derivation).** D&J's per-orientation inequality holds with w(θ) + h(θ) on the right-hand side, not just its minimum. Integrate that over θ ∈ [0, π/2] and apply Cauchy's formula (perimeter = ∫₀^π width(θ) dθ). This gives OPT ≥ per(conv(S ∪ {o}))/2, which is π/2 for points on a unit-diameter circle and matches D&J's remark. This is not stated as such in the paper.
- **The semi-perimeter potential carries over.** "Reduction of enclosing-rectangle semi-perimeter ≤ (|cos| + |sin|)·length" is a usable heuristic score: pick strokes that maximize the reduction of Σ_j (hull or rectangle size of pile-group j) per unit cost. A rake-specific version is derived in Section 6.
- **Report length and stroke count separately.** Theorem 2 shows the two objectives can conflict: a length-optimal solution may need Θ(n) sweeps while a 4-sweep solution is only 1.27× longer. The benchmark should report both, or a Pareto front, rather than one scalar.
- **Pile semantics.** Being able to re-move piles is exactly D&J's "pile" semantics. It makes optimality and lower-bound proofs harder (D&J needed an extra argument for CP), but it never hurts solution quality.

### Gaps
- No published results on:
  - sweeping into **multiple targets or piles**;
  - a **bounded broom** shorter than 2·diam(S);
  - sweeping **inside polygons or among obstacles**;
  - **locality or reach** constraints on the sweeper;
  - **NP-hardness** of sweeping points, which is still open, with no hardness proof found.
- I read the 2009 author copy of "Sweeping points," not the typeset Algorithmica version. Journal volume, issue and pages come from the compendium's reference list.
- The CCCG 2010 slanted-sweep paper (Bousany et al.) could not be retrieved (host unreachable), so its results are known here only through Dumitrescu & Jiang's description.

## 2. Lawn mowing and milling (Arkin, Fekete & Mitchell 2000, and later work): cutter models, ratios, link to TSPN, implications for a rake of half-width l

### Takeaway
Lawn mowing (the cutter may leave the region) and milling (it may not) with a disk or square cutter are both NP-hard. Arkin, Fekete & Mitchell (AFM) gave constant-factor approximations: (3+ε) for lawn mowing and 2.5 for milling according to the indexed abstract. 2023 papers cite 2√3·α_TSP ≈ 3.46·α_TSP as the best guarantee for the disk cutter, where α_TSP is the approximation factor of the TSP algorithm used. Exact lawn mowing is algebraically hard (ESA 2023), and its membership in NP or ∃R is open. The key bridge: for a finite point set, "the cutter of radius r covers point w" is the same as "the cutter's centre visits the disk D(w, r)". So covering points with a tool reduces exactly to TSP with disk neighborhoods (the close-enough TSP, CETSP), and CETSP on a witness set gives rigorous lower bounds. In our game, a stroke captures p iff the stroke segment meets D(p, l).

### Cited Findings
- **AFM bibliography.** E. M. Arkin, S. P. Fekete, J. S. B. Mitchell, "Approximation algorithms for lawn mowing and milling," *Computational Geometry: Theory and Applications* 17(1–2):25–50 (Oct 2000), DOI 10.1016/S0925-7721(00)00015-8. — [Stony Brook record](https://researchconnect.stonybrook.edu/en/publications/approximation-algorithms-for-lawn-mowing-and-milling/)
- **AFM model and results.**
  - **Problem.** Find a shortest tour or path for a cutter (typically a circle or square) so that every point of a planar region is covered at some moment. In *milling* the cutter must stay inside the region.
  - **Applications.** Milling comes from NC pocket machining; lawn mowing from inspection, spray painting and search.
  - **Hardness.** Both are NP-hard.
  - **Results.** Constant-factor approximations for both, plus a TSP approximation on simple grid graphs that is used to mill simple rectilinear polygons.
  - **Constants in the indexed abstract.** (3+ε) for lawn mowing, 2.5 for milling, 6.5 for TSP on simple grid graphs, and 11.5 for milling simple rectilinear polygons. The 6.5 and 11.5 appear garbled as "65" and "115" in the index.
  - — [Stony Brook record](https://researchconnect.stonybrook.edu/en/publications/approximation-algorithms-for-lawn-mowing-and-milling/)
- **2.5 for milling is still the reference value.** Fekete, Mitchell & Schmidt (2011) call it the best known approximation for milling, an O(n log n)-time 2.5-approximation from AFM. — [Fekete, Mitchell, Schmidt, arXiv 1101.2360](https://arxiv.org/abs/1101.2360)
- **Disk-cutter guarantee cited in 2023.** Two 2023 papers name 2√3·α_TSP ≈ 3.46·α_TSP (AFM 2000) as the currently best lawn-mowing guarantee, with a TSP PTAS giving 2√3 + ε. The factor decomposes as: proximity approximation (asymptotic factor 3) × grid conversion (2/√3) × TSP approximation (1+ε). The algorithm computes a TSP tour on the dual graph of a hexagonal tiling. — [ESA 2023, arXiv 2307.01092](https://arxiv.org/abs/2307.01092); [ALENEX 2023, arXiv 2211.05891](https://arxiv.org/abs/2211.05891)
- **Algebraic hardness and polyomino results (ESA 2023).** S. P. Fekete, D. Krupke, M. Perk, C. Rieck, C. Scheffer, "The Lawn Mowing Problem: From Algebra to Algorithms," ESA 2023, LIPIcs paper 45, DOI 10.4230/LIPIcs.ESA.2023.45.
  - **Model.** A unit-diameter disk cutter C; coverage is the Minkowski sum T ⊕ C of the tour.
  - **Theorem 1.** Even for a 2×2 square, an optimal tour has coordinates that are roots of polynomials not solvable by radicals over ℚ (the Galois group of a degree-16 polynomial is S₁₆).
  - **Polyominoes.**
    - A tour of the dual grid graph of length L converts to a feasible tour of length ≤ L(1 + τ), τ ≈ 0.32566.
    - Resulting ratios: ≈ 1.5908 for simple polyominoes without cut vertices, ≈ 1.7565 with holes.
    - The ratios combine Arkin et al.'s constructive upper bounds on grid-tour length, (6N − 4)/5 and 53N/40, with the area lower bound L ≥ N pixels. As a check, 1.5908 ≈ (6/5)(1 + τ) and 1.7565 ≈ (53/40)(1 + τ). The extracted text was partly garbled.
  - **Turn-cost PTAS.** They cite a PTAS for minimizing length + C·(number of 90° turns) in integral orthogonal polygons, with running time 2^{O(h)}·N^{O(C)}, where h is the number of holes.
  - — [arXiv 2307.01092](https://arxiv.org/abs/2307.01092); [LIPIcs](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESA.2023.45)
- **Witness-set method (ALENEX 2023).** "A Closer Cut: Computing Near-Optimal Lawn Mowing Tours" (Fekete, Krupke, Perk, Rieck, Scheffer).
  - **Structure.** Optimal lawn-mowing tours are polygonal with a bounded number of vertices. Some optimal tours of rational polygons need irrational vertices, such as √(1 − (λ/2)²) (Thm 3.1).
  - **Theorem 4.1.** A point w is covered by a cutter of radius r exactly when the cutter's centre visits D(w, r).
  - **Lower bounds.** For any witness set W ⊂ P, the optimal CETSP tour of W lower-bounds the optimal lawn-mowing tour. Growing W gives an increasing sequence of lower bounds.
  - **Witness-set size.** For ε-robust coverage they bound the witness set by ⌈2d²/ε²⌉ points, independent of the number of polygon vertices (d as defined in the paper).
  - **Solver.** CETSP is solved with Coutinho et al.'s 2016 SOCP-based branch-and-bound. Behdani & Smith 2014 and Mennell 2009 are cited as alternatives.
  - **Results.** Hundreds of instances with up to 2000 vertices.
    - Often optimal when the relative area is up to about 6.
    - Within 50% of the lower bound up to about 30.
    - The AFM-style approximation stays about 100% above the lower bound.
  - — [arXiv 2211.05891](https://arxiv.org/abs/2211.05891)
- **Complexity status (∃R compendium).** The compendium lists the lawn mowing problem as CG-Open25. Input: a polygon with holes and a length k; is there a polygonal curve of length ≤ k with every point of the polygon within distance 1 of it?
  - It is NP-hard (AFM), and AFM also show milling NP-hard for polygons with holes.
  - Volk (2023, KIT bachelor's thesis) puts it in a higher real-complexity class; the symbol is garbled in my text extraction, plausibly ∃∀ℝ.
  - Membership in ∃R is open.
  - — [arXiv 2407.18006](https://arxiv.org/abs/2407.18006)
- **Turn costs.** Arkin, Bender, Demaine, Fekete, Mitchell, Sethia, "Optimal covering tours with turn costs." The cost depends on both tour length and number of turns. They prove minimum-turn milling NP-complete and give approximations, including a PTAS based on m-guillotine subdivisions. The extended abstract is in SODA 2001. — [TU Berlin report 674-2000](https://page.math.tu-berlin.de/~combi/coga-old/publications/techreports/2000/Report-674-2000.html); [arXiv cs/0309014](https://arxiv.org/abs/cs/0309014)
- **Covering with travel cost.** Fekete, Mitchell, Schmidt, "Minimum covering with travel cost" (ISAAC 2009; *J. Comb. Optim.* 24(1), 2012, DOI 10.1007/s10878-010-9303-0). A tour T with a set S(T) of discrete scan points costs c·|S(T)| + L(T): a per-scan cost plus tour length. The problem is NP-hard. They give approximations for rectilinear and general polygons, PTASes for a fixed scan-to-travel cost ratio, and a bicriteria version. — [arXiv 1101.2360](https://arxiv.org/abs/1101.2360); [RePEc record](https://ideas.repec.org/a/spr/jcomop/v24y2012i1d10.1007_s10878-010-9303-0.html)

### Inferences
- **Points version.** "Rake over every point at least once" is lawn mowing on a discrete point set with a disk of radius l. The "covered iff the path hits D(p, l)" equivalence of Theorem 4.1 applies verbatim with the stroke segment playing the role of the path.
  - In our game the "mower path" is a set of straight strokes that each end in a pile, not one connected tour.
  - Lawn-mowing tour bounds are therefore relaxations, valid as lower bounds only after accounting for agent travel.
- **Scale of total stroke length in dense clusters.** The Minkowski-area argument (Section 3, Dumitrescu–Tóth Lemma 8) gives total stroke length ≳ (A − m·π·l²)/(2l) to sweep a region of area A with m strokes. Rule of thumb: total stroke length ≈ (cluster area)/(2l), whereas D&J line sweeps scale with semi-perimeter.
- **Cost models.** The turn-cost and scan-plus-travel models are direct templates for a game objective α·(#strokes) + β·(distance), with bicriteria or Pareto reporting. Strokes play the role of scans or turns.
- **Algorithm to transfer.** AFM-style: overlay a grid or hexagonal tiling with cell size about l, keep the non-empty cells, run TSP over cell representatives, and convert to strokes. This is a constant-factor template in the coverage sense, before the reach and pile-termination constraints are added.

### Gaps
- I could not access AFM's full text, so I could not confirm which cutter shape the abstract's (3+ε) refers to, as against the 2√3·α_TSP bound for the disk. Both values are reported above with their sources.
- I found no improvement on the general lawn-mowing ratio after 2023, and no lawn-mowing or milling result for finite point sets with reach or hop constraints.

## 3. TSP with neighborhoods (Arkin & Hassin 1994; Dumitrescu & Mitchell 2003; Mitchell's PTAS; later work): relevance to visiting within radius k or covering within l

### Takeaway
"Come within k of every point" is TSPN, or CETSP for equal radii, with disks D(p, k). "Stroke within l of every point" is a segment-hitting version with disks D(p, l). What is known:
- TSPN is NP-hard, APX-hard for general neighborhoods, and NP-hard to approximate within less than 2 for connected regions.
- Disjoint unit disks: a simple 3.55-approximation and a PTAS.
- Overlapping unit disks: about 7.62, improved to 6.75 (Dumitrescu–Tóth). This is the regime of clustered points with k larger than the spacing.
- Disks of arbitrary radii: O(1).
- Fat regions: PTASes for bounded depth.

The packing lemma gives an immediate lower bound: a path visiting m pairwise-disjoint radius-δ disks has length ≥ (πδ/4)(m − 4).

### Cited Findings
- **Arkin & Hassin 1994.** E. M. Arkin, R. Hassin, "Approximation algorithms for the geometric covering salesman problem," *Discrete Applied Mathematics* 55(3):197–218. Each client names a neighborhood where it will meet the salesman, and the minimum tour visiting all neighborhoods is NP-hard. — [Stony Brook record](https://researchconnect.stonybrook.edu/en/publications/approximation-algorithms-for-the-geometric-covering-salesman-prob/); [INFORMS reference list](https://pubsonline.informs.org/doi/references/10.1287/ijoc.1110.0480)
- **Arkin–Hassin constants (as reported by Dumitrescu & Mitchell).** O(1)-approximations for:
  - parallel equal segments, 3√2 + 1;
  - translates of a convex region, √(3² + 7²) + 1 ≈ 8.62;
  - translates of a connected region, √(3² + 11²) + 1;
  - regions with parallel diameters of comparable length.
  - Dumitrescu & Mitchell remove the "+1" in each case.
  - — [Dumitrescu & Mitchell, ar5iv 1703.01640](https://ar5iv.labs.arxiv.org/html/1703.01640)
- **Dumitrescu & Mitchell 2003.** A. Dumitrescu, J. S. B. Mitchell, "Approximation algorithms for TSP with neighborhoods in the plane," *J. Algorithms* 48:135–159 (2003). The arXiv version adds brief clarifying remarks (2014).
  - **Results:** O(1) for connected neighborhoods of comparable diameter; a PTAS for disjoint unit disks (and nearly disjoint, nearly equal disks); improved special cases; and linear-time O(1) for infinite lines.
  - **Proposition 1 (disjoint unit disks).** A simple tour T satisfies |T| ≤ ((1 + 8/π)|T*| + 8)(1 + ε), which gives a ratio ≤ 3.55 for large n. No tour through disk centres can guarantee better than 2.
  - **Proposition 2 (overlapping unit disks).** |T| ≤ ((π + 8)|T*| + 8π)(1 + ε) + 2π, giving 11.15. The translates bound √58 ≈ 7.62 also applies to unit disks.
  - **Theorem 2 (connected regions of equal diameter).** O(1), with explicit constant 33 = 15.5 + 15.5 + 2 from their Combination Lemma.
  - **Packing bounds.** For n disjoint unit disks, a disk of radius 2 sweeping the optimal tour covers all of them, so π·n ≤ 4L* + 4π. In general, for radius δ: π·δ²·n ≤ 4δL + 4πδ².
  - **The 2014 remarks.** They only clarify the m-guillotine dynamic program: it uses connectivity constraints. They do not retract the PTAS.
  - — [arXiv 1703.01640](https://arxiv.org/abs/1703.01640); [ar5iv full text](https://ar5iv.labs.arxiv.org/html/1703.01640)
- **Dumitrescu & Tóth, "The Traveling Salesman Problem for Lines, Balls and Planes."** SODA 2013, pp. 828–843.
  - **Table 1.**
    - Unit disks in the plane: 7.62 (Dumitrescu–Mitchell) improved to **6.75**.
    - Disjoint unit disks: 3.55 (Dumitrescu–Mitchell).
    - New: disjoint unit balls in ℝ³ 7.01; unit balls in ℝ³ 100.61; unit balls in ℝ^d O(7.73^d).
    - Hyperplanes: (1+ε)·2^{d−1}/√d.
  - **Hardness summary.**
    - TSPN is NP-hard because Euclidean TSP is.
    - It is APX-hard for general neighborhoods (de Berg et al.; Safra–Schwartz), even for segments of nearly equal length (Elbassioni et al.).
    - Connected planar regions are NP-hard to approximate within a factor below 2 (Safra–Schwartz).
    - Disconnected regions are APX-hard, with point pairs the simplest case.
  - **Lemma 8.** For a connected geometric graph of length L, the area of its Minkowski sum with a radius-x disk is at most 2Lx + πx².
  - **Centres versus disks.** For n disks of radius r, an optimal tour of the centres is at most 2nr longer than an optimal tour of the disks.
  - — [arXiv 1303.6659](https://arxiv.org/abs/1303.6659)
- **Other prior work (as summarized by Dumitrescu & Tóth).**
  - Mata & Mitchell: O(log n) for connected, possibly overlapping neighborhoods.
  - Bodlaender et al.: PTAS for disjoint fat regions of similar size in ℝ^d.
  - de Berg et al.: O(1) for disjoint fat convex regions in the plane.
  - Elbassioni et al.: O(1) for fat convex regions, and O(2^d/√d) for disjoint balls in ℝ^d.
  - Mitchell: a PTAS for fat regions of bounded depth, and O(1) for pairwise-disjoint connected neighborhoods.
  - Chan & Jiang: PTAS for fat weakly disjoint regions in doubling metrics.
  - — [arXiv 1303.6659](https://arxiv.org/abs/1303.6659)
- **Disks of arbitrary radii.** Dumitrescu & Tóth, "Constant-Factor Approximation for TSP with Disks" (arXiv 1506.07903, v4 2016). This is the first O(1)-approximation for disks of arbitrary radii and arbitrary intersections. It reduces the problem, up to constant factors, to minimum-weight hitting set in a geometric hypergraph. — [arXiv 1506.07903](https://arxiv.org/abs/1506.07903)
- **Practical exact solutions.** Equal-radius TSPN is the close-enough TSP. Exact solutions and lower bounds come from SOCP-based branch-and-bound (Coutinho et al. 2016) and other methods (Behdani & Smith 2014; Mennell 2009), as used in lawn-mowing lower-bound computation. — [ALENEX 2023, arXiv 2211.05891](https://arxiv.org/abs/2211.05891)

### Inferences
- **Lower bound on agent travel.**
  - The agent's motion is a ≤k-hop path on objects. Relaxing the hop constraint gives a continuous path, so CETSP over the disks of the points that must be reached is a valid lower bound on agent travel.
  - If captured points need not be approached directly, the radius grows to k + l (Section 6).
- **Overlap regime and baselines.**
  - With mild clustering and k ≥ typical spacing, the disks overlap heavily. That is the "overlapping unit disks" regime: 6.75 is the best known guarantee, and the PTAS machinery does not apply.
  - With k ≪ spacing the disks are disjoint and PTAS-type results apply.
  - A transferable baseline with provable flavour (the Dumitrescu–Mitchell analysis):
    1. Greedily pick a maximal subset of points that are pairwise more than 2k apart (or 2(k + l) apart). These are pairwise-disjoint disks, i.e. an independent set.
    2. Tour them with any good TSP heuristic.
    3. Serve every other point from the nearest waypoint.
  - The packing lemma ties the number of waypoints to OPT.
- **Hitting-set view.** "Choose strokes so their segments hit many D(p, l)" is a geometric hitting-set or covering problem. The Dumitrescu–Tóth reduction of TSPN to minimum-weight hitting set suggests stroke selection by greedy or LP-rounding hitting set over candidate capsules.
- **Hardness consequence.** As k, l → 0 every point must be visited, so any game objective that includes agent travel contains Euclidean TSP and is NP-hard. This is an inference by restriction, not a published result for this game.

### Gaps
- I did not read Arkin–Hassin's full text, so their disk-specific ratio is unverified.
- I did not fetch the title or venue of Mitchell's fat-region PTAS. From memory it is SODA 2007; verify before citing.
- I did not search systematically for 2017–2026 improvements on overlapping unit disks below 6.75.
- I found no TSPN variant with a **hop constraint** (the agent may only move onto objects within k, and objects disappear as it works).

## 4. Coverage path planning (boustrophedon, spiral and lawnmower patterns, surveys) and variants that push or gather material to a goal

### Takeaway
Classical coverage path planning (CPP) gives the standard sweep patterns for a tool of width w = 2r:
- Boustrophedon cellular decomposition (Choset & Pignon): each cell is covered by back-and-forth passes.
- Spanning-tree coverage, STC (Gabriely & Rimon).
- Spirals.

The number of parallel passes in direction θ is the region's altitude divided by 2r, so the best direction minimizes altitude (Huang 2001; Bochkarev & Smith 2016). The surveys are Choset 2001, Galceran & Carreras 2013, and a 2026 arXiv survey. CPP covers *area*, however, and does not transport material. Push-to-goal work is mostly empirical: reinforcement-learning robots pushing all objects into a receptacle, and bulldozer or earth-moving planning. Snow-plow "push coverage" appears mainly in patents. I found no approximation theory for coverage with material accumulation.

### Cited Findings
- **Galceran & Carreras 2013.** E. Galceran, M. Carreras, "A survey on coverage path planning for robotics," *Robotics and Autonomous Systems* 61(12):1258–1276, DOI 10.1016/j.robot.2013.09.004. About 1,658 citations on Semantic Scholar. — [Semantic Scholar](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1016/j.robot.2013.09.004?fields=title,abstract,venue,year,authors,externalIds,citationCount); [UdG repository record](https://dugi-doc.udg.edu/handle/10256/9088)
- **Galceran & Carreras content.** CPP is defined as finding a path that passes over every point of an area or volume while avoiding obstacles. Applications include vacuum cleaning, painting, underwater mosaicking, demining, lawn mowing, harvesting and inspection. The survey reviews the most successful methods of the previous decade, because no updated survey had appeared in ten years. — [repository record via search](https://dugi-doc.udg.edu/handle/10256/9088)
- **Boustrophedon decomposition.** Choset & Pignon (1997) give a provably complete cellular decomposition in which each cell is covered by simple back-and-forth motions. — [Choset & Pignon 1997, CMU PDF](https://publications.ri.cmu.edu/storage/publications/pub_files/pub1/choset_howie_1997_5/choset_howie_1997_5.pdf)
- **Choset 2001 survey.** "Coverage for robotics – A survey of recent results," *Annals of Mathematics and AI* 31, DOI 10.1023/A:1016639210559. It groups methods into heuristic, approximate, partial-approximate and exact cellular decompositions, and lists snow removal among the applications. This is per the CMU page snippet; I did not read the full text. — [CMU RI page](https://ri.cmu.edu/?p=16816); [DOI](https://www.doi.org/10.1023/A:1016639210559)
- **Spanning-tree coverage (STC).** Y. Gabriely, E. Rimon, "Spanning-tree based coverage of continuous areas by a mobile robot," *Ann. Math. Artif. Intell.* 31(1–4):77–98 (2001); conference version ICRA 2001, pp. 1927–1933. A square-shaped tool, a cell decomposition, and a spanning tree whose perimeter the robot follows. — [DBLP](https://dblp.uni-trier.de/pid/01/1590.html)
- **Sweep direction and number of turns (Bochkarev & Smith).** S. Bochkarev, S. L. Smith, "On Minimizing Turns in Robot Coverage Path Planning," IEEE CASE 2016.
  - The *altitude* of a polygon in direction θ captures the number of parallel line segments, and hence turns, needed to cover it.
  - Eq. (1): with footprint radius r, the number of lines needed in direction θ is the altitude divided by 2r, rounded to an integer.
  - They compute the minimum altitude of non-convex polygons, re-optimize the cuts of a decomposition to minimize the sum of altitudes, then tour the segments.
  - They note that convex workspaces can be covered optimally and efficiently by sweeping or spiralling, while general coverage is NP-hard.
  - They cite W. H. Huang, "Optimal line-sweep-based decompositions for coverage algorithms," ICRA 2001, vol. 1, pp. 27–32. Huang's dynamic program minimizes turns, but its runtime is exponential and it ignores transition costs.
  - — [Bochkarev & Smith PDF](https://ece.uwaterloo.ca/~sl2smith/papers/2016CASE_Coverage.pdf)
- **Recent survey (2026).** Shen et al., "Coverage Path Planning: Classical Foundations, Recent Advances, and Future Directions," arXiv 2607.10649 (Jul 2026). It reviews 125 works, mostly 2015–2026, in six categories: single-robot, multi-robot, 3D, constrained, learning-based and visual. Its abstract does not mention material-pushing variants. — [arXiv 2607.10649](https://arxiv.org/abs/2607.10649)
- **Push-to-goal (Spatial Action Maps).** J. Wu, X. Sun, A. Zeng, S. Song, J. Lee, S. Rusinkiewicz, T. Funkhouser, "Spatial Action Maps for Mobile Manipulation," RSS 2020, DOI 10.15607/RSS.2020.XVI.035.
  - A mobile robot must push all objects into a receptacle, "like a bulldozer", in unseen environments, trained with reinforcement learning over pixel-wise action maps.
  - Reported emergent behaviour: it pushes objects along walls, where it becomes easy to push several at once into the receptacle.
  - — [arXiv 2004.09141](https://arxiv.org/abs/2004.09141); [RSS proceedings](https://roboticsproceedings.org/rss16/p035.html); [project page](https://spatial-action-maps.cs.princeton.edu/)
- **Earth-moving and bulldozer planning.**
  - Hirayama, Whitty, Katupitiya, Guivant (2018, *Int. J. Advanced Robotic Systems* 15, DOI 10.1177/1729881418764716) plan the distribution of material at a dumping area with integer linear programming plus a hybrid heuristic with local branching. — [DOAJ record](https://doaj.org/article/6c2ba1a7963c4c9abbdd141dd3d1811b)
  - A curvature-constrained bulldozer pushing planner does greedy heuristic search over "pushing states"; its authors describe it as complete but not optimal. — [IEEE DataPort entry](https://ieee-dataport.org/node/4549)
  - A 2022 grading paper notes that learning-based bulldozer path planning is sparse. — [arXiv 2206.06091](https://arxiv.org/abs/2206.06091)
- **Snow removal.** What I found are patents, not peer-reviewed algorithms. One builds a grid snow-coverage map with cell size tied to plow width. Another uses D*Lite to reach uncleared cells. — [US patent 11993284](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11993284); [US patent 12650699](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12650699)

### Inferences
- **Boustrophedon baseline.** For a cluster, stroke spacing 2l in the minimum-altitude (minimum-width) direction gives about altitude/(2l) strokes and about area/(2l) of stroke length.
  - Our strokes must *end in a pile* and the agent cannot teleport. So the pattern becomes either "boustrophedon toward a spine where piles sit" or a radial star of capsules into each pile.
  - **Radial star (my estimate):** for a disk-shaped cluster of radius R with one central pile, covering the rim takes about πR/l rays of full length R. Total length is about πR²/l = area/l, roughly twice the boustrophedon ideal, because rays overlap near the pile.
  - **Multi-stage alternative:** strip strokes into intermediate piles founded on points near a spine, then merge those piles along the spine (the merges capture more points). This brings the cost back to about area/(2l) + O(R). Multi-stage is unavoidable anyway when R exceeds about 2k.
- **Never stranding via a spanning tree.** STC's idea of following a spanning tree transfers to stranding safety. Take a spanning tree of the k-disk graph of the remaining objects. Absorbing *leaves first* (post-order toward the eventual pile sites) never disconnects the remaining objects, because removing a leaf keeps a tree connected. Section 6 discusses the capsule caveat.
- **Pile-dragging captures.** The Spatial Action Maps behaviour of accumulating and then pushing many at once corresponds to dragging a growing pile along a route whose capsule sweeps up loose points. Under our rules, a pile-into-pile merge stroke also captures loose points within l, so routing merges through dense areas gives free captures.
- **Strokes as turns.** In turn-minimizing CPP, "number of strokes" plays the role of "number of turns or passes", and l plays the role of footprint radius r.

### Gaps
- I found no peer-reviewed theory with guarantees for coverage that **moves accumulating material** (snow plow, debris sweeping, leaf piles whose mass grows) to goals.
- I did not access Galceran & Carreras's full text, so its taxonomy details and its discussion of sweep direction are not verified here.
- I did not verify Choset's 2000 *Autonomous Robots* journal paper on boustrophedon decomposition. I cited the 1997 conference PDF instead.

## 5. Complexity of pushing and gathering puzzles where one move moves many objects

### Takeaway
Pushing problems with fixed obstacles and a local pusher are very hard:
- Sokoban is PSPACE-complete.
- Push-1 is PSPACE-complete (2025).
- Push-k for k ≥ 2, and Push-1F, are PSPACE-complete (2022).
- Push-* (push arbitrarily many blocks in a row, the closest analogue of raking many leaves at once) is NP-hard, with its exact class open.

Global-control analogues, where every particle moves, are also hard:
- Tilt reconfiguration with obstacles is NP-hard, and finding a minimum-length control sequence is PSPACE-complete.
- Gathering in partially filled polyominoes is NP-hard and hard to approximate (SoCG 2026), yet polynomial in completely filled polyominoes.
- Grid line-push "trash compaction" is NP-complete.

Sweeping points has no hardness result. Our game has no obstacles and objects merge, so a PSPACE-type feasibility blow-up is unlikely. Exact optimization is still expected to be NP-hard, inheriting TSP, covering and clustering structure. That last point is an inference.

### Cited Findings
- **Older status (Demaine's pushing-blocks page).** Pushing-block puzzles are at least NP-hard and at most in PSPACE in every parameter combination.
  - Sokoban: NP-hard (Dor & Zwick, *CGTA* 13(4):215–228, 1999) and PSPACE-complete (Culberson, FUN 1998, pp. 65–76).
  - Push-* with fixed blocks: NP-hard (Dhagat & O'Rourke 1992).
  - Push-*: NP-hard (Hoffmann, CCCG 2000).
  - Noncrossing (X) variants: NP-complete (Hoffmann & Demaine, CCCG 2001).
  - Wilfong (1991): NP-hardness of pushing and pulling L-shaped pieces.
  - — [erikdemaine.org/pushingblocks](https://erikdemaine.org/pushingblocks/)
- **Classic papers.** Demaine, Demaine, O'Rourke, "PushPush and Push-1 are NP-hard in 2D" (CCCG 2000); Demaine, Demaine, Hoffmann, O'Rourke, "Pushing blocks is hard" (*CGTA*, 2003). — [references in DeStefano & Liang, arXiv 2508.17602](https://arxiv.org/html/2508.17602v2); [paper page](https://erikdemaine.org/papers/PushingBlocks_CGTA)
- **New PSPACE results.**
  - Push-1 is PSPACE-complete (Z. DeStefano, B. Liang, arXiv 2508.17602, Aug 2025, with gadgets verified by the GADGETEER system). The MIT Hardness Group gave an independent concurrent proof.
  - Earlier, "Pushing Blocks via Checkable Gadgets" (FUN 2022; Chung, Demaine, Diomidova, Hendrickson, Lynch and coauthors) proved Push-2 and Push-1F PSPACE-complete, and Push-k PSPACE-complete for k ≥ 2.
  - Push-* is described as the final open problem in the Push family.
  - — [arXiv 2508.17602](https://arxiv.org/abs/2508.17602)
- **Tilt (global-control) model.** Becker, Demaine, Fekete, Lonsford, Morris-Wright, "Particle computation: complexity, algorithms, and logic," *Natural Computing* 18(1):181–201 (2019), DOI 10.1007/s11047-017-9666-6. One global signal moves every particle maximally in one direction. With stationary obstacles, deciding reconfigurability is NP-hard and finding a minimum-length control sequence is PSPACE-complete. — [paper page](https://erikdemaine.org/papers/Tilt_NACO/)
- **Gathering in the tilt model (SoCG 2026).** Fekete, Friemel, Kramer, Reinhardt, Rieck, Scheffer, "Tilt Automata: Gathering Particles With Uniform External Control" (SoCG 2026; arXiv 2603.02796).
  - The goal is a direction sequence that gathers all particles in one position under full tilt in a polyomino.
  - Gathering is polynomial-time in a *completely filled* polyomino.
  - Approximating shortest gathering sequences is hard, and so is deciding gatherability in *partially filled* polyominoes.
  - Deciding whether a position can be occupied is NP-hard even in polyominoes without holes, answering an open question of Balanza-Martinez et al. (SODA 2020).
  - The paper connects tilt models to synchronizing automata.
  - — [arXiv 2603.02796](https://arxiv.org/abs/2603.02796)
- **Line-push, tilt and global-step results (Akitaya, Löffler, Viglietta).**
  - Trash compaction: NP-complete in general, polynomial for 2×k.
  - Full-tilt relocation: PSPACE-complete (Balanza-Martinez et al.).
  - Single-step global control: NP-complete when restricted to two directions (Caballero et al.).
  - Their open problems: whether deciding sparse→compact reachability is NP-complete, and whether the shortest permutation-puzzle solution is NP-hard (conjectured).
  - — [arXiv 2202.12045](https://arxiv.org/abs/2202.12045)
- **Sweeping points.** Its complexity is open. — [∃R compendium CG-Open26](https://arxiv.org/abs/2407.18006); [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Covering points by lines (relevant to the minimum number of strokes when l → 0).** Dumitrescu & Jiang, "On the approximability of covering points by lines and related problems" (arXiv 1312.2549).
  - Covering Points by Lines is NP-hard and APX-hard.
  - The best known ratio is O(log n) by greedy set cover, and they prove greedy is Ω(log n) on this problem.
  - Minimum-Link Covering Tour, Minimum-Link Spanning Tour and Min-Max-Turn Hamiltonian Tour are APX-hard or NP-hard.
  - — [arXiv 1312.2549](https://arxiv.org/abs/1312.2549)

### Inferences
- **What drives Sokoban-style hardness, and what our game lacks.** The PSPACE reductions rely on fixed walls and blocks that obstruct motion, together with irreversibility. Our game has no obstacles, and its merging behaves like the "completely filled → polynomial" gathering case.
  - Irreversibility remains, and the reach constraint can destroy reachability when a capsule absorbs a bridge point. That is a direct analogue of Sokoban "deadlocks".
  - So a simulator needs a cheap stranding (deadlock) test before each stroke (Section 6).
- **Exact optimization is plausibly NP-hard by restriction:**
  - (a) agent travel with k, l → 0 contains Euclidean TSP;
  - (b) minimizing strokes when l > 0 contains geometric covering (covering points by lines or strips, which is APX-hard);
  - (c) exact pile sizes t contain capacitated clustering.
  - None of these is a published theorem about this game.
- **Benchmark design.** Report gaps to the lower bounds of Section 6. Compute exact optima only by MIP or search on tiny instances.

### Gaps
- No complexity result exists for this game, or for Push-type models where pushed objects *merge*.
- The PushPush-k PSPACE-completeness result (attributed to Demaine, Hoffmann, Holzer, FUN 2004) was seen only in a search snippet, not verified from a primary source.
- The author list of the FUN 2022 "Checkable Gadgets" paper is only partially verified. The fetch tool garbled the first author's name.
- The SoCG 2026 tilt-gathering paper's specific approximation factor and upper bounds on sequence length were not verified. Search summaries mentioned a 4-approximation and O(n·c·D²) sequences; treat these as unconfirmed.

## 6. Which results give usable lower bounds or provable baselines for the benchmark?

### Takeaway
Reportable *literature* lower bounds and baselines:
- D&J's line-sweep bounds: OPT ≥ w; OPT ≥ (w + h)/√2; OPT ≥ (π/4)·(minimum enclosing-rectangle semi-perimeter); Steiner-tree arguments.
- TSPN packing and Minkowski-area bounds: L ≥ (πδ/4)(m − 4) and area ≤ 2Lx + πx².
- CETSP-on-witness-set lower bounds, computable exactly for moderate sizes.
- Penrose's connectivity threshold for choosing k.
- Constant-factor baselines: D&J 4/π (≤4 sweeps), AFM 2.5 / (3+ε) / 2√3·α_TSP, TSPN 3.55 / 6.75 / PTAS.

On top of these I derive game-specific bounds. **They are this researcher's derivations and need review:**
- an exact stroke-count identity;
- a Steiner/MST-forest bound on total stroke length;
- a capsule-adapted version of D&J's perimeter bound;
- a capacitated n-median bound on mass×distance work;
- a CETSP bound on agent travel with radius k + l.

### Cited Findings
- **D&J line-sweep lower bounds.**
  - OPT ≥ w, the width of the bounding rectangle of S ∪ {o} in the chosen frame.
  - OPT ≥ (w + h)/√2.
  - OPT ≥ (π/4)·min_θ(w(θ) + h(θ)).
  - Steiner-tree bound: √3 for a unit equilateral triangle.
  - Worst case over unit-diameter sets: between √3 and 2.
  - Simple 2-sweep or 4-sweep algorithms with ratios √2 (O(n)) and 4/π (O(n log n)).
  - — [D&J](https://adriandumitrescu.org/sweep2.pdf)
- **Slanted-sweep bounds.** For a convex polygon P, the sweeping cost is at most per(P) − |s| for any side s. The 4/π ratio also holds for the minimum-perimeter rectangle and parallelogram 2-sweep algorithms. — [arXiv 1101.4667](https://arxiv.org/abs/1101.4667)
- **Packing and area bounds.**
  - A tour visiting n disjoint disks of radius δ satisfies π·δ²·n ≤ 4δL + 4πδ², i.e. L ≥ (πδ/4)(n − 4). — [Dumitrescu & Mitchell](https://ar5iv.labs.arxiv.org/html/1703.01640)
  - The Minkowski sum of a connected graph of length L with a radius-x disk has area ≤ 2Lx + πx². — [Dumitrescu & Tóth, Lemma 8](https://arxiv.org/abs/1303.6659)
- **Witness-set lower bounds in practice.**
  - The CETSP optimum for any witness subset lower-bounds a coverage tour.
  - Witness sets grow monotonically.
  - SOCP branch-and-bound (Coutinho et al. 2016) solves CETSP exactly.
  - Practical gaps: often 0% at small relative area, ≤ 50% up to relative area about 30.
  - — [arXiv 2211.05891](https://arxiv.org/abs/2211.05891)
- **Area lower bound for grid tours.** For polyominoes with a unit-square cutter, L ≥ N pixels (Lemma 9). Arkin et al.'s constructive grid-tour bounds, (6N − 4)/5 for simple polyominoes without cut vertices and 53N/40 with holes, are the matching upper bounds that give the ≈1.59 and ≈1.76 ratios. — [arXiv 2307.01092](https://arxiv.org/abs/2307.01092)
- **Number of parallel passes.** ⌈altitude/(2r)⌉ in a given direction. Minimize over directions, i.e. use the minimum width, to get the fewest passes. — [Bochkarev & Smith](https://ece.uwaterloo.ca/~sl2smith/papers/2016CASE_Coverage.pdf)
- **Covering points by lines is hard.** It is NP-hard and APX-hard, and greedy is Θ(log n) at best. Minimum-link covering tours are APX-hard or NP-hard. So exact "minimum number of straight strokes" is unlikely to be computable at scale, and lower bounds should come from LP relaxations or counting. — [arXiv 1312.2549](https://arxiv.org/abs/1312.2549)
- **Connectivity threshold for k.** M. D. Penrose, "The longest edge of the random minimal spanning tree," *Ann. Appl. Probab.* 7(2):340–361 (1997). For n uniform points in the unit square, with M_n the longest nearest-neighbour edge and M′_n the longest MST edge:
  - n·π·M_n² − log n converges in law to the double-exponential (Gumbel) distribution;
  - P[M′_n = M_n] → 1, so the same holds for the MST.
  - — [Penrose abstract page](https://people.bath.ac.uk/masmdp/ab/longest.html); [Project Euclid](https://projecteuclid.org/journals/annals-of-applied-probability/volume-7/issue-2/The-longest-edge-of-the-random-minimal-spanning-tree/10.1214/aoap/1034625335.full)
- **Combined cost models.** Scan-count × cost + travel length, with bicriteria versions and PTASes for a fixed ratio, are a template for a weighted strokes + distance objective. — [arXiv 1101.2360](https://arxiv.org/abs/1101.2360)

### Inferences
These are derivations for the benchmark, made under the stated reading of the rules. Verify them against the simulator's exact semantics.

Rules assumed:
- piles are founded on points;
- a stroke moves the selected object (loose point or whole pile) straight to an existing pile and captures loose points within l;
- piles never split;
- hence every object's location is always one of the original point sites, and each final pile sits at an original site.

1. **Stroke-count identity.**
   - Each stroke removes 1 + c_i objects (loose points plus piles), where c_i is the number of loose points it captures.
   - Founding a pile leaves the object count unchanged.
   - Hence Σ_i (1 + c_i) = N − n exactly, i.e. #strokes = N − n − C, where C is the total number of captures.
   - With l = 0, every valid plan uses exactly N − n strokes (no wasted moves are possible: every stroke merges).
   - Pile-founding actions come on top of this: at least n of them, and more if founded piles are later merged.
   - Lower bound: #strokes ≥ (N − n)/(1 + c_max).
     - If the destination pile must also be within k of the agent, each capsule lies inside D(x, k + l) around the agent position x.
     - Then c_max ≤ max_x |S ∩ D(x, k + l)|, which is computable in O(N²) or better.
   - A tighter bound comes from the LP relaxation of covering S by feasible capsules, a geometric set cover. The exact version is APX-hard by analogy with covering by lines.
2. **Stroke-length bound via Steiner trees.** This adapts D&J's Steiner-path argument.
   - All points of final pile j (group G_j) are connected to the final pile site by the union of: the stroke segments of strokes into pile j, plus a connector of length ≤ l from each captured point to its stroke's segment.
   - Strokes into other piles never move G_j members, because merged objects never separate.
   - Hence Σ_i |s_i| + l·C ≥ Σ_j SMT(G_j), where SMT is the Euclidean Steiner minimal tree.
   - Since MST ≤ 2·SMT, and any n-group partition yields a spanning forest with n components:
     **Σ_i |s_i| + l·C ≥ ½·MSF_n(S)**, where MSF_n(S) = MST(S) minus its n − 1 longest edges (Kruskal stopped at n components).
   - This is computable in O(N log N) and valid for any plan.
   - The bound is strongest when l is small relative to point spacing.
3. **Capsule-adapted D&J perimeter bound.**
   - For group G_j, track the width W(θ) of its current positions.
   - A stroke of length L moves its members by vectors d with along-stroke component in [−l, L + l] and perpendicular component ≤ l.
   - So it shrinks W(θ) by at most (L + 2l)|cos φ| + 2l|sin φ|, where φ is the angle between the stroke and θ.
   - Integrating over θ ∈ [0, π) and applying Cauchy's formula (∫ W = perimeter of the convex hull) gives **Σ_{strokes into j} (|s_i| + 4l) ≥ per(conv(G_j))/2**.
   - Summing over j needs a minimization over valid partitions, which is only tractable exactly by MIP on small instances. Otherwise use a relaxation, for example per(conv G_j) ≥ 2·diam(G_j) inside an LP or MIP over partitions.
   - With l = 0 it reproduces D&J's bound OPT ≥ per/2 for a single target.
   - It complements bound 2: it is better when captures per stroke exceed about 4.
4. **Mass×distance work bound.**
   - Each point travels at least its displacement, and the final pile sites are original sites.
   - So **Work ≥ min over centres c_1..c_n ∈ S and partitions into n groups of exactly t points of Σ_j Σ_{p∈G_j} |p − c_j|**. This is a capacitated (exact capacity t) discrete n-median.
   - For fixed centres it is a transportation problem, whose LP is integral.
   - The LP relaxation of the full facility-location MIP gives a scalable lower bound; solve the exact MIP for small N.
   - If pile-size error is tolerated, relax the capacities. If piles could be placed off-site, use continuous medians instead.
5. **Agent-travel bound.**
   - If both ends of every stroke must be within k of the agent's current position, every original point is at some moment within k + l of the agent: selected within k, or inside a capsule contained in D(x, k + l).
   - So agent travel ≥ the open CETSP path from the start point over disks of radius k + l. Approximate this with witness subsets as in the 2023 lawn-mowing work.
   - Cheap closed form: L ≥ (π(k + l)/4)(m − 4) for any m points that are pairwise more than 2(k + l) apart, by the packing lemma.
   - If strokes may end at piles beyond k, enlarge the radius by the maximum stroke length.
6. **Stranding (feasibility).**
   - Under the rules above, the occupied sites are always a subset of S, so the k-disk graph of remaining objects is always an *induced subgraph* of G_k(S).
   - Necessary condition: G_k(S) must be connected, i.e. k ≥ the longest EMST edge of S.
   - For uniform points, Penrose's result gives k* ≈ √((log N + c)/(π N)) in the unit square, scaled by √(area). Clustering raises it because of gaps between clusters.
   - Sufficient safe policy: before each stroke, check that the remaining induced k-disk graph, including the agent's site, stays connected after deleting the selected and captured sites. This is an articulation-point test, O(V + E), and it matters because capsules can absorb bridge points.
   - Removing leaves of a spanning tree first is always safe when captures are disabled.
7. **Baselines to report alongside the lower bounds.**
   - (a) D&J-style "two orthogonal sweeps per cluster" in the minimum-perimeter-rectangle orientation, as a very-long-rake, free-repositioning reference;
   - (b) boustrophedon or radial-star strokes with spacing 2l in the minimum-altitude direction;
   - (c) greedy maximum-capture strokes with the connectivity check;
   - (d) a TSPN-style waypoint tour: a maximal 2(k + l)-separated subset toured by any good TSP heuristic.
   - Report gaps against the maximum of bounds 1–5 for each metric.

### Gaps
- The game-specific bounds 1–6 are this researcher's derivations, not published results. They depend on rule details that should be fixed first:
  - whether the destination pile must be within k;
  - where the agent stands after a stroke;
  - whether a dragged pile's capsule captures;
  - whether pile positions are restricted to original sites.
- I found no published benchmark or lower-bound suite for multi-pile raking or sweeping.
- The CETSP solver references (Coutinho et al. 2016; Behdani & Smith 2014) were taken from the 2023 lawn-mowing paper and not fetched directly.
- I did not research the exact distribution of the MST bottleneck for clustered (non-uniform) point processes.
