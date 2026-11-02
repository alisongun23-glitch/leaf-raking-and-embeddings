# Linear algebra of local origins, local PCA, and "matrices that encode a line"

Scope: the mathematics behind the proposal (1) make the "centre-most point" of each cluster a local origin, express nearby points as vectors in that frame, restrict each frame to its own region, label every point by nearest cluster; (2) treat points on a straight path into the origin as "eigenvectors of a matrix that models the line"; (3) generalise to many dimensions. Written for someone learning linear algebra; terms are defined when first used. Notation: vectors are columns, `ᵀ` is transpose, `I` is the identity matrix, `‖x‖` is Euclidean length, `uᵀv` is the dot product, `uuᵀ` is the outer product (a matrix). Two small data sets are used throughout:

- **Example A (hand-checkable).** Four points in the plane: p1 = (1, 1), p2 = (−1, −1), p3 = (−0.5, 0.5), p4 = (0.5, −0.5). Their mean is (0, 0).
- **Example B (computed).** Five points: (1, 1), (2, 2.5), (3, 2.5), (4, 4), (5, 5). Mean (3, 3); the point (3, 2.5) is the medoid.

All numbers below were checked with a short pure-Python script (file `toy2.py` in the session scratchpad); the covariance normalisation is stated each time, because `1/m` and `1/(m−1)` give the same eigenvectors but eigenvalues that differ by the factor `m/(m−1)`.

---

## 1. Translation versus linear maps: why eigenvectors need an origin, and centroid versus medoid

### Takeaway
Moving the origin is a translation, which is an affine map and not a linear map, so eigenvectors (a purely linear notion) are only defined after you have chosen an origin; the covariance matrix is defined about the mean, and centering on any other point c (for example a medoid) adds the rank-one matrix (μ − c)(μ − c)ᵀ, which tilts the principal directions toward the line joining c to the mean.

### Cited Findings
- An affine transformation has the form y = f(x) = Ax + b, with A the linear part and b a translation vector; "Translations are affine transformations", "an affine transformation need not preserve the origin of the affine space", and "every linear transformation is affine, but not every affine transformation is linear" — [Wikipedia, Affine transformation](https://en.wikipedia.org/wiki/Affine_transformation)
- An affine map "preserves lines and parallelism, but not necessarily Euclidean distances and angles" — [Wikipedia, Affine transformation](https://en.wikipedia.org/wiki/Affine_transformation)
- Homogeneous ("augmented") coordinates: vectors get an appended 1 and the matrix is extended with a translation column and a bottom row ending in 1, so that one matrix multiplication performs both the linear map and the translation — [Wikipedia, Affine transformation](https://en.wikipedia.org/wiki/Affine_transformation)
- "If there is a fixed point, we can take that as the origin, and the affine transformation reduces to a linear transformation." — [Wikipedia, Affine transformation](https://en.wikipedia.org/wiki/Affine_transformation)
- The eigenvector equation is Av = λv with v nonzero: multiplying by A "simply scales v by a factor λ"; an eigenvector "does not change direction", and "If the eigenvalue is negative, then the eigenvector's direction is reversed" — [Wikipedia, Eigenvalues and eigenvectors](https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors)
- The sample covariance matrix is Q = 1/(N−1) Σᵢ (xᵢ − x̄)(xᵢ − x̄)ᵀ, i.e. a sum of outer products of the *mean-centred* observations; in matrix form Q = 1/(N−1)(M − 1ₙx̄ᵀ)ᵀ(M − 1ₙx̄ᵀ) where M holds the observations as rows — [Wikipedia, Sample mean and covariance](https://en.wikipedia.org/wiki/Sample_mean_and_covariance)
- Population version of the same identity: the covariance K = E[(X − μ)(X − μ)ᵀ] satisfies K = E[XXᵀ] − μμᵀ (listed as basic property 1) — [Wikipedia, Covariance matrix](https://en.wikipedia.org/wiki/Covariance_matrix)
- "Classical PCA assumes the cloud of points has already been translated so its centroid is at the origin"; without centering "the rank‑one term n μ μ^T often dominates, forcing the leading eigenvector to point almost exactly toward the mean"; "Mean subtraction is an integral part of the solution towards finding a principal component basis that minimizes the mean square error of approximating the data" — [Wikipedia, Principal component analysis](https://en.wikipedia.org/wiki/Principal_component_analysis)
- In probabilistic PCA the covariance used is S = (1/N) Σₙ (tₙ − μ)(tₙ − μ)ᵀ and "The maximum likelihood estimator for μ is given by the mean of the data, in which case S is the sample covariance matrix" — [Tipping & Bishop, Probabilistic principal component analysis, JRSS-B 1999, eq. (5)](https://www.cs.columbia.edu/~blei/seminar/2020-representation/readings/TippingBishop1999.pdf)
- A medoid is "the most centrally located point in the cluster", an actual data point chosen to minimise total dissimilarity to the other members, whereas k-means centroids "can fall between data points" — [Wikipedia, k-medoids](https://en.wikipedia.org/wiki/K-medoids)

### Inferences

**Why a translation is not linear.** A map T is linear when T(x + y) = T(x) + T(y) and T(cx) = cT(x). Putting c = 0 gives T(0) = 0: every linear map sends the origin to itself. The translation T(x) = x + b sends 0 to b, so for b ≠ 0 it is not linear. "Re-centre the origin on a point c" is exactly the translation x ↦ x − c. Consequently:

- Any sentence of the form "v is an eigenvector of …" presupposes an origin: Av = λv says "A stretches the arrow from the origin to v without turning it", and that arrow is different for different origins. This is why the proposal's step (1) (choose an origin) must come *before* step (2) (talk about eigenvectors); the order is forced by the mathematics.
- If a matrix A is applied *in the local frame* (to the vectors x − c), then in the original coordinates the map is x ↦ A(x − c) + c = Ax + (c − Ac): an affine map whose fixed point is c. The Wikipedia sentence "if there is a fixed point, we can take that as the origin, and the affine transformation reduces to a linear transformation" is precisely the proposal's re-centering, read backwards.

**Homogeneous coordinates make a translation into a matrix.** Append a 1 to every vector and use the (d+1)×(d+1) block matrix

```
M = [ A  b ]        M [x]   [Ax + b]
    [ 0  1 ]  ,       [1] = [  1   ]
```

Multiplying out the eigenvector equation for M gives two kinds of eigenvector (derivation, not a quoted result):

- [v; 0] with Av = λv: pure *directions* (last coordinate 0), carried over from A unchanged.
- [p; 1] with Ap + b = p and eigenvalue exactly 1: the *fixed points* of the affine map.

A pure translation (A = I, b ≠ 0) therefore has every direction as an eigenvector (eigenvalue 1) and no fixed point at all: it moves every point and preserves every direction. This is the precise sense in which "a translation has no eigenvectors": it has no eigen-*points*, only eigen-*directions*.

**Centering on the mean versus centering on a medoid: the rank-one term.** Let x₁, …, xₘ be the cluster, μ = (1/m) Σ xᵢ its mean (centroid), and c any other candidate origin (for example the medoid). Define the "scatter about c"

```
S_c = (1/m) Σᵢ (xᵢ − c)(xᵢ − c)ᵀ .
```

Write xᵢ − c = (xᵢ − μ) + (μ − c) and expand the outer product; the two cross terms contain Σᵢ (xᵢ − μ), which is the zero vector by the definition of μ. What remains is

```
S_c = S_μ + (μ − c)(μ − c)ᵀ ,        S_μ = (1/m) Σᵢ (xᵢ − μ)(xᵢ − μ)ᵀ .
```

This is the matrix form of the cited identity K = E[XXᵀ] − μμᵀ (which is the case c = 0). Consequences:

1. (μ − c)(μ − c)ᵀ is a rank-one, positive semidefinite matrix whose only nonzero eigenvalue is ‖μ − c‖², with eigenvector μ − c. Adding it never decreases any eigenvalue and adds exactly ‖μ − c‖² to the trace.
2. The eigenvectors of S_c are *not* the eigenvectors of S_μ unless μ − c happens to be an eigenvector of S_μ (or c = μ). Centering on a medoid rotates the "principal directions" toward the line from the medoid to the centroid, by an amount that grows with ‖μ − c‖² relative to the eigenvalues of S_μ. The PCA page's warning that an uncentred rank-one term "often dominates, forcing the leading eigenvector to point almost exactly toward the mean" is the same phenomenon with c = 0.
3. So the proposal can use the medoid as the *origin of the coordinate system* (where arrows start) but should still compute the covariance *about the mean* if it wants the standard principal directions. Both are legitimate; they answer different questions ("scatter about the representative point" versus "scatter about the centre of mass").

*Numeric check, one dimension.* Data 0, 1, 2, 3, 10. Mean μ = 3.2; medoid = 2 (sum of distances 12, versus 13 for 1 or 3). Variance about the mean (1/m): (10.24 + 4.84 + 1.44 + 0.04 + 46.24)/5 = 12.56. Variance about the medoid: (4 + 1 + 0 + 1 + 64)/5 = 14. And 12.56 + (3.2 − 2)² = 12.56 + 1.44 = 14. ✓

*Numeric check, two dimensions (Example B, 1/m normalisation).*
S_μ = [[2.0, 1.9], [1.9, 1.9]]; medoid c = (3, 2.5), so μ − c = (0, 0.5) and (μ − c)(μ − c)ᵀ = [[0, 0], [0, 0.25]].
S_c = [[2.0, 1.9], [1.9, 2.15]], which equals S_μ + (μ − c)(μ − c)ᵀ. ✓
Eigenvalues/leading eigenvector: about the mean 3.8507, 0.0493 with v₁ = (0.7163, 0.6977); about the medoid 3.9765, 0.1735 with v₁ = (0.6930, 0.7209). The leading direction has rotated about 2° toward the vertical (the direction of μ − c), and the minor eigenvalue has more than tripled.

### Gaps
- No source states the S_c = S_μ + (μ − c)(μ − c)ᵀ identity in exactly that form for a medoid; it is derived above from the cited covariance identity and verified numerically.
- The eigenvector classification of the homogeneous matrix [[A, b], [0, 1]] is derived here; the Wikipedia affine-transformation page discusses fixed points but not eigenvectors.

---

## 2. "Points on a line are eigenvectors": for which matrices is this literally true?

### Takeaway
Being an eigenvector is a property of a matrix, not of a point; all points on a line through the origin are scalar multiples of one direction vector u, so that line is the eigenspace of every matrix that has u as an eigenvector, the canonical examples being the orthogonal projection P = uuᵀ (eigenvalues 1 on the line, 0 on its orthogonal complement), the scaling I + (s − 1)uuᵀ, and the reflection 2uuᵀ − I. A line that does not pass through the origin is not a subspace and cannot be an eigenspace of any linear map; it becomes one only after translating, or as the set of fixed points of an affine projection in homogeneous coordinates.

### Cited Findings
- Definition: for an n × n matrix A and a nonzero vector v, if Av = λv then v is an eigenvector and λ its eigenvalue; "the eigenvectors are any nonzero scalar multiples of" a given eigenvector; the eigenspace is the set of eigenvectors for λ "together with the zero vector" and "is a linear subspace", "closed under addition" and "closed under scalar multiplication" — [Wikipedia, Eigenvalues and eigenvectors](https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors)
- Eigenvectors of a linear transformation "are those vectors that are only stretched or shrunk, with neither rotation nor shear"; in the shear example the horizontal vectors are eigenvectors and "these eigenvectors all have an eigenvalue equal to one" — [Wikipedia, Eigenvalues and eigenvectors](https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors)
- A linear subspace is a nonempty subset closed under linear combinations; "a subspace is a flat in an n-space that passes through the origin"; the set of points (x, y) with x = y "is a subspace of R2" — [Wikipedia, Linear subspace](https://en.wikipedia.org/wiki/Linear_subspace)
- Orthogonal projection onto the line through a unit vector u: "If u is a unit vector on the line, then the projection is given by the outer product" P_u = uuᵀ, which "leaves u invariant, and it annihilates all vectors orthogonal to u"; uuᵀ "is not a projection if ‖u‖ ≠ 1" (use u(uᵀu)⁻¹uᵀ instead) — [Wikipedia, Projection (linear algebra)](https://en.wikipedia.org/wiki/Projection_(linear_algebra))
- A projection is idempotent, P² = P; "The eigenvalues of a projection matrix must be 0 or 1", and the eigenspaces for 0 and 1 "are (respectively) the kernel and range of the projection" — [Wikipedia, Projection (linear algebra)](https://en.wikipedia.org/wiki/Projection_(linear_algebra))
- Projection onto the column space of A: P_A = A(AᵀA)⁻¹Aᵀ, reducing to AAᵀ for orthonormal columns — [Wikipedia, Projection (linear algebra)](https://en.wikipedia.org/wiki/Projection_(linear_algebra)); the same formula, "the matrix that projects a vector b onto the space spanned by the columns of A", is the centrepiece of Strang's 18.06 Lecture 16 — [MIT OCW 18.06SC, Projection matrices and least squares](https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/pages/least-squares-determinants-and-eigenvalues/projection-matrices-and-least-squares)
- Reflection (Householder matrix) H = I − 2vvᵀ with v a unit normal: "A Householder matrix has eigenvalues ± 1"; "1 is an eigenvalue of multiplicity n − 1" (the vectors orthogonal to v), and "−1 is an eigenvalue with multiplicity 1" because Hv = −v; H is symmetric, orthogonal and involutory (H² = I) — [Wikipedia, Householder transformation](https://en.wikipedia.org/wiki/Householder_transformation)
- Affine maps preserve lines and parallelism (so they map lines to lines even when they move the origin) — [Wikipedia, Affine transformation](https://en.wikipedia.org/wiki/Affine_transformation)

### Inferences

**The line through the origin is a subspace, and "the points on it" are "the eigenspace".** Let u be a unit vector. The line L = {t·u : t real} is the span of u. Every point on L is a scalar multiple of u, so if Au = λu then A(tu) = t·Au = λ(tu): every point of L is an eigenvector with the same eigenvalue (except the origin itself, which by convention is in the eigenspace but is not called an eigenvector). L is the whole eigenspace for λ exactly when no vector off L shares that eigenvalue. So the correct statement is not "the points are eigenvectors of the line" but: *given a line through the origin, there are matrices whose λ-eigenspace is that line; the points of the line are eigenvectors of each such matrix.*

**Which matrices? There are infinitely many; the three standard ones are built from uuᵀ.**

| Matrix | Action | Eigenvalue on L (= span u) | Eigenvalue on L⊥ (everything orthogonal to u) |
|---|---|---|---|
| Projection P = uuᵀ | drops the component perpendicular to the line | 1 | 0 |
| Scaling A_s = I + (s − 1)uuᵀ | stretches by s along the line, leaves L⊥ alone | s | 1 |
| Reflection R = 2uuᵀ − I (2-D: reflection across L; in d dimensions, −(Householder matrix for v = u)) | flips L⊥, keeps L | 1 | −1 |

Checks: P u = u(uᵀu) = u; for w ⊥ u, P w = u(uᵀw) = 0. A_s u = u + (s − 1)u = s u. R u = 2u − u = u; R w = −w. All three are symmetric, and P² = P. The projection is the one that deserves the name "the matrix that encodes the line": it is the unique orthogonal projection whose range (column space) is L, it has rank 1, and L = range(P) = 1-eigenspace while L⊥ = kernel(P) = 0-eigenspace (the cited kernel/range statement). The same line is also the column space of *any* rank-one matrix uwᵀ (w ≠ 0), so "a matrix that encodes the line" is not unique; the eigenvalue attached to the line is a free choice (1, s, or anything).

**Being an eigenvector is a property of the matrix.** The points of L are eigenvectors of P, A_s and R, and of every other matrix with u as an eigenvector; the same points are *not* eigenvectors of, say, a rotation by 30° (which has no real eigenvectors at all) or of a generic matrix. Saying "these points are eigenvectors" without naming the matrix has no content, because for any direction one can always write down a matrix (uuᵀ) that has it as an eigenvector. The useful question is the reverse one: *given a matrix that arises from the data* (the covariance, Section 3), which directions are its eigenvectors?

**Worked numbers (Example A).** The dominant direction is u = (1, 1)/√2.
- P = uuᵀ = [[0.5, 0.5], [0.5, 0.5]]. P p1 = (1, 1) = p1 (eigenvalue 1). P p3 = (−0.5·0.5 + 0.5·0.5, same) = (0, 0): p3 lies on L⊥ and is an eigenvector with eigenvalue 0. P² = P (multiply it out: 0.25 + 0.25 = 0.5 in each entry).
- Scaling by s = 3 along u: A₃ = I + 2uuᵀ = [[2, 1], [1, 2]]. A₃ p1 = (3, 3) = 3·p1; A₃ p3 = (−1 + 0.5, −0.5 + 1) = (−0.5, 0.5) = p3 (eigenvalue 1).
- Reflection R = 2uuᵀ − I = [[0, 1], [1, 0]] (it swaps the coordinates). R p1 = p1; R p3 = (0.5, −0.5) = −p3.
- Example B's dominant direction gives P = [[0.5132, 0.4998], [0.4998, 0.4868]] with eigenvalues 1.0000 and 0.0000 and max |P² − P| ≈ 10⁻¹⁶; the reflection 2P − I has eigenvalues +1 and −1.

**Lines not through the origin.** The line L' = {p + t·u} with p not a multiple of u contains no scalar multiples of its own points (scaling p + tu by 0 gives the origin, which is not on L'), so it is not closed under scalar multiplication and is not a subspace (the cited "flat that passes through the origin" characterisation). Hence L' is not the eigenspace of any linear map, and its points are not all eigenvectors of any single matrix with a common eigenvalue. Concretely, for the line through (1, 0) with direction (1, 1)/√2 (Example A's P): P(1, 0) = (0.5, 0.5), which is not a multiple of (1, 0). Two correct repairs:

1. *Translate.* Choose any point of the line (for instance p, or the cluster centre) as the origin; then L' − p = L is a subspace and everything in the table applies. This is the proposal's step (1) and it is exactly what makes step (2) meaningful.
2. *Homogeneous coordinates.* In R^{d+1}, L' corresponds to the plane through the origin spanned by [p; 1] and [u; 0], which is a subspace. The affine map x ↦ p + P(x − p) = Px + (I − P)p is the orthogonal projection onto L'; its fixed points are exactly the points of L' (because (I − P)(x − p) = 0 if and only if x − p ∈ range(P) = L). In homogeneous form [[P, (I − P)p], [0, 1]], the points of L' are the eigenvectors [x; 1] with eigenvalue 1. So the closest true version of "points on a straight path are eigenvectors of a matrix modelling the line" for a general line is: *they are the fixed points of the affine projection onto that line.*

### Gaps
- The Wikipedia eigenvalue page excerpt did not include its reflection example; the reflection eigenvalues ±1 are taken from the Householder page instead.
- "Every direction has a matrix for which it is an eigenvector" and the homogeneous-coordinates projection are derivations here, not quotations.

---

## 3. Local PCA: principal directions are eigenvectors of the centred covariance; eigenvalues are variances; the SVD view; small clusters are nearly a tautology

### Takeaway
For a cluster of m points in d dimensions, the principal directions are the eigenvectors v_k of the mean-centred covariance S = X_cᵀX_c/(m − 1) and each eigenvalue λ_k is the variance of the data projected onto v_k; equivalently v_k are the right singular vectors of the centred data matrix with λ_k = σ_k²/(m − 1). Because the m centred rows sum to zero, rank(S) ≤ m − 1, so with m ≪ d (6 points in 300-D) local PCA merely rediscovers the ≤ 5-dimensional flat the points span, and any conclusion must be compared with a null model of random clusters of the same size.

### Cited Findings
- "the principal components are eigenvectors of the data's covariance matrix"; "The first principal component can equivalently be defined as a direction that maximizes the variance of the projected data"; each eigenvalue λ(k) "is equal to the sum of the squares over the dataset associated with each component k" (so proportional to the variance along it) — [Wikipedia, Principal component analysis](https://en.wikipedia.org/wiki/Principal_component_analysis)
- SVD view: X = UΣWᵀ; "the singular values σ(k) of X are equal to the square-root of the eigenvalues λ(k) of XᵀX"; the right singular vectors "are equivalent to the eigenvectors of XᵀX"; "XᵀX itself can be recognized as proportional to the empirical sample covariance matrix" — [Wikipedia, Principal component analysis](https://en.wikipedia.org/wiki/Principal_component_analysis)
- Hotelling's definition quoted by Tipping & Bishop: the q principal axes "are those orthonormal axes onto which the retained variance under projection is maximal", they "are given by the q dominant eigenvectors … of the sample covariance matrix S", such that Sw_j = λ_j w_j, and the projected variables "are then uncorrelated such that the covariance matrix … is diagonal with elements λ_j" — [Tipping & Bishop, JRSS-B 1999, §2](https://www.cs.columbia.edu/~blei/seminar/2020-representation/readings/TippingBishop1999.pdf)
- Pearson's complementary property: "of all orthogonal linear projections … the principal component projection minimizes the squared reconstruction error" — [Tipping & Bishop, JRSS-B 1999, §2](https://www.cs.columbia.edu/~blei/seminar/2020-representation/readings/TippingBishop1999.pdf)
- Covariance matrices are "symmetric and positive semi-definite" and can be "diagonalized by a linear orthogonal transformation", the diagonal entries after diagonalisation being variances of the transformed components; the diagonalisation-based method "is called principal component analysis" — [Wikipedia, Covariance matrix](https://en.wikipedia.org/wiki/Covariance_matrix)
- Sample covariance Q = 1/(N−1) Σᵢ (xᵢ − x̄)(xᵢ − x̄)ᵀ, and a covariance matrix is positive definite if and only if the centred vectors xᵢ − x̄ have full rank K (the number of variables) — [Wikipedia, Sample mean and covariance](https://en.wikipedia.org/wiki/Sample_mean_and_covariance)
- "the results of PCA depend on the scaling of the variables"; "PCA is at a disadvantage if the data has not been standardized" — [Wikipedia, Principal component analysis](https://en.wikipedia.org/wiki/Principal_component_analysis)
- In PPCA the maximum-likelihood loading matrix is W_ML = U_q(Λ_q − σ²I)^{1/2}R, where "the q column vectors in the d × q matrix U_q are the principal eigenvectors of S, with corresponding eigenvalues λ₁, …, λ_q", R an arbitrary rotation, and σ²_ML is the average of the d − q discarded eigenvalues — [Tipping & Bishop, JRSS-B 1999, eq. (7)–(8)](https://www.cs.columbia.edu/~blei/seminar/2020-representation/readings/TippingBishop1999.pdf)

### Inferences

**Setup and formulas.** Stack the cluster's m points as rows of an m × d matrix X. Let μ = (1/m)Xᵀ1 be the mean and X_c = X − 1μᵀ the centred matrix (each row has μ subtracted). The sample covariance is

```
S = X_cᵀ X_c / (m − 1)          (d × d, symmetric, positive semidefinite).
```

Because S is symmetric it has an orthonormal eigenbasis: S = VΛVᵀ with V = [v₁ … v_d], VᵀV = I, Λ = diag(λ₁ ≥ λ₂ ≥ … ≥ 0). For any unit vector w, the variance of the data's coordinates along w is

```
var(X_c w) = (1/(m − 1)) ‖X_c w‖² = wᵀ S w ,
```

and for w = v_k this is v_kᵀ S v_k = λ_k. So *eigenvalue = variance along its eigenvector*, and because v₁ maximises wᵀSw over unit w (the Rayleigh quotient), v₁ is the direction of maximum variance. The coordinates of a point x in the cluster's own frame are z = Vᵀ(x − μ); keeping only the first q, z_q = V_qᵀ(x − μ), is the local PCA representation, and x ≈ μ + V_q z_q is the reconstruction (Pearson's minimum-squared-error property).

**SVD view.** Write the thin singular value decomposition X_c = UΣWᵀ (U is m × r with orthonormal columns, Σ = diag(σ₁ ≥ … ≥ σ_r > 0), W is d × r). Then X_cᵀX_c = WΣ²Wᵀ, so

```
S = W (Σ²/(m − 1)) Wᵀ :   v_k = w_k  and  λ_k = σ_k² / (m − 1).
```

The right singular vectors are the principal directions; the singular values squared, divided by m − 1, are the variances. (With the 1/m normalisation, λ_k = σ_k²/m.) Computing the SVD of X_c is numerically preferable to forming S explicitly, and when m ≪ d the small m × m Gram matrix X_cX_cᵀ has the same nonzero eigenvalues σ_k².

**Worked example (Example A, 1/m normalisation).** Points (1, 1), (−1, −1), (−0.5, 0.5), (0.5, −0.5); mean (0, 0) so X_c = X.
- S_xx = (1 + 1 + 0.25 + 0.25)/4 = 0.625, S_yy = 0.625, S_xy = (1 + 1 − 0.25 − 0.25)/4 = 0.375.
- S = [[0.625, 0.375], [0.375, 0.625]]. For a matrix [[a, b], [b, a]] the eigenvalues are a ± b: λ₁ = 1.0 with v₁ = (1, 1)/√2 and λ₂ = 0.25 with v₂ = (1, −1)/√2. Check Sv₁ = (0.625 + 0.375, 0.375 + 0.625)/√2 = (1, 1)/√2 = 1·v₁. ✓
- Projections onto v₁: p1 → √2, p2 → −√2, p3 → 0, p4 → 0; variance (2 + 2 + 0 + 0)/4 = 1.0 = λ₁. ✓ Projections onto v₂: 0, 0, −1/√2, 1/√2; variance (0.5 + 0.5)/4 = 0.25 = λ₂. ✓
- Trace S = 1.25 = λ₁ + λ₂; total scatter Σ‖pᵢ‖² = 2 + 2 + 0.5 + 0.5 = 5 = m·trace S. ✓
- SVD: σ₁ = √(m λ₁) = 2, σ₂ = √(m λ₂) = 1, and ‖X_c‖²_F = 5 = σ₁² + σ₂². ✓
- Local coordinates of p1: z = Vᵀp1 = (√2, 0): "1.41 units along the main axis, nothing across it".

**Worked example (Example B, 1/(m − 1) normalisation, computed).** S = [[2.5, 2.375], [2.375, 2.375]]; eigenvalues 4.8133 and 0.0617 (sum 4.875 = trace); v₁ = (0.7163, 0.6977), v₂ = (0.6977, −0.7163), v₁·v₂ = 0. Projections onto v₁: (−2.828, −1.065, −0.349, 1.414, 2.828) with sample variance 4.8133 = λ₁; onto v₂: (0.037, −0.340, 0.358, −0.019, −0.037) with variance 0.0617 = λ₂. Singular values of X_c: 4.3879 and 0.4967, and σ_k²/(m − 1) = 4.8133, 0.0617 = λ_k. ✓

**Rank and the small-cluster tautology.** The centred rows satisfy Σᵢ (xᵢ − μ) = 0, a linear dependency among the m rows of X_c, so

```
rank(S) = rank(X_c) ≤ min(m − 1, d).
```

(This is the contrapositive of the cited statement that S is positive definite only when the centred vectors have full rank d.) Numeric demonstration: for 6 random Gaussian points in 300-D, the 6 × 6 Gram matrix G = X_cX_cᵀ satisfies G·1 = X_c(X_cᵀ1) = X_c·0 = 0 to machine precision (output: [−0.0, 0.0, −0.0, −0.0, 0.0, −0.0]), so G, and therefore S, has rank at most 5. Consequences for "local PCA on 6 words in 300-D":

- At least 295 of the 300 eigenvalues are exactly zero. The 5 nonzero eigenvectors span exactly the affine hull of the 6 points, and *any* 6 points in general position in 300-D span a 5-dimensional flat. "The cluster lies in a 5-D subspace" is therefore not a finding; it is counting.
- The only non-trivial information is the *shape* of the nonzero spectrum (λ₁, …, λ₅): is the variance concentrated in one or two directions (a "straight path" or a thin sheet) or spread evenly (a blob)? Even this must be judged against a null model, because 6 random vectors also have unequal eigenvalues purely by chance. A practical null: draw many random clusters of the same size from the same ambient data (or random Gaussian vectors of matching norm), compute their spectra, and ask whether the observed λ₁/Σλ_k (the "fraction of variance explained" by the first direction) is unusual.
- Mahalanobis distance and whitening (Section 4) need S⁻¹, which does not exist when rank(S) < d; small clusters force a regularised covariance such as PPCA's WWᵀ + σ²I (whose σ² is the average discarded eigenvalue and makes the matrix invertible) or a shrinkage toward the identity.
- Scaling matters: PCA "depends on the scaling of the variables", so a local frame built on raw coordinates and one built on standardised coordinates have different principal directions.

### Gaps
- The Wikipedia PCA and sample-covariance pages do not state the rank ≤ m − 1 bound explicitly; it is proved above from the row-sum dependency and verified numerically.
- No source for a specific null-model recipe for tiny-cluster spectra was consulted; the recommendation above is an inference. (Random-matrix results such as the Marchenko–Pastur law exist for this purpose but were not fetched or verified here.)

---

## 4. Mahalanobis distance and whitening: the cluster's own ruler; Gaussian mixtures versus k-means

### Takeaway
Within a cluster frame, the Mahalanobis distance d_M(x)² = (x − μ)ᵀΣ⁻¹(x − μ) measures how many standard deviations away a point is along each principal axis, and equals the Euclidean distance after whitening by Σ^{−1/2} = VΛ^{−1/2}Vᵀ; a Gaussian mixture model is exactly "one local origin μ_k plus one local covariance Σ_k per cluster", while k-means is the degenerate case in which every cluster is forced to use the same spherical ruler.

### Cited Findings
- Mahalanobis distance of x from a distribution with mean μ and covariance Σ: d_M(x) = √((x − μ)ᵀ Σ⁻¹ (x − μ)); "the Mahalanobis distance is the Euclidean distance after a whitening transformation"; it "is zero for P at the mean of D and grows as P moves away from the mean along each principal component axis"; "If each of these axes is re-scaled to have unit variance, and whitened to be uncorrelated, then the Mahalanobis distance corresponds to standard Euclidean distance in the transformed space" — [Wikipedia, Mahalanobis distance](https://en.wikipedia.org/wiki/Mahalanobis_distance)
- For classification a test point is assigned to "that class for which the Mahalanobis distance is minimal"; for a normal distribution the density "is uniquely determined by the Mahalanobis distance", which "is proportional, for a normal distribution, to the square root of the negative log-likelihood" — [Wikipedia, Mahalanobis distance](https://en.wikipedia.org/wiki/Mahalanobis_distance)
- A whitening matrix W satisfies WᵀW = Σ⁻¹ so that the transformed covariance is the identity; W = Σ^{−1/2} is "Mahalanobis or ZCA whitening"; PCA whitening uses "the eigen-system of" Σ; "There are infinitely many possible whitening matrices W that all satisfy the above condition" — [Wikipedia, Whitening transformation](https://en.wikipedia.org/wiki/Whitening_transformation)
- The inverse covariance is "the precision matrix"; the (pseudo-)inverse covariance "induces the Mahalanobis distance"; the Gaussian density is expressed with Σ⁻¹ in the exponent and |Σ| as the "generalized variance" — [Wikipedia, Covariance matrix](https://en.wikipedia.org/wiki/Covariance_matrix)
- In a Gaussian mixture each component is a normal distribution with its own mean and covariance; the E-step computes "expectation values for the membership variables of each data point" (a "partial membership" of every point in every component), and in the M-step "each component mean and covariance is the component specific weighted average of the mean and covariance of the entire sample" — [Wikipedia, Mixture model](https://en.wikipedia.org/wiki/Mixture_model)
- Standard k-means "is a special case of a Gaussian mixture model", namely the limiting case with diagonal, equal covariances of infinitesimally small variance, and equivalently a special case of "hard" Gaussian mixture modelling — [Wikipedia, k-means clustering](https://en.wikipedia.org/wiki/K-means_clustering)
- PPCA models the observation covariance as C = WWᵀ + σ²I, which with W_ML from the top-q eigenvectors and σ² the average discarded eigenvalue is a low-rank-plus-noise covariance; a full covariance "implies the estimation of d(d + 1)/2 free parameters", PPCA's has dq + 1 − q(q − 1)/2, and the isotropic and full covariance models are "special cases" of it — [Tipping & Bishop, JRSS-B 1999, §3–4.3](https://www.cs.columbia.edu/~blei/seminar/2020-representation/readings/TippingBishop1999.pdf)
- A mixture of PPCA models can be fitted by EM and used for "clustering, density modeling, and local dimensionality reduction" — [Tipping & Bishop, Mixtures of probabilistic principal component analysers, Neural Computation 11(2), 1999, abstract](https://mlanthology.org/neco/1999/tipping1999neco-mixtures)

### Inferences

**Mahalanobis distance in the eigenbasis.** With Σ = VΛVᵀ (so Σ⁻¹ = VΛ⁻¹Vᵀ when all λ_k > 0) and local coordinates z = Vᵀ(x − μ),

```
d_M(x)² = (x − μ)ᵀ V Λ⁻¹ Vᵀ (x − μ) = Σ_k z_k² / λ_k = Σ_k (z_k / √λ_k)² .
```

Each term is "coordinate along principal axis k, measured in units of that axis's standard deviation √λ_k". That is the sense in which Σ^{−1/2} is the cluster's own ruler: one unit of Mahalanobis distance is one standard deviation in whatever direction you look.

**Whitening.** Σ^{−1/2} = VΛ^{−1/2}Vᵀ is symmetric and satisfies (Σ^{−1/2})ᵀ(Σ^{−1/2}) = Σ⁻¹, so it is a whitening matrix (ZCA); Λ^{−1/2}Vᵀ is another (PCA whitening), and so is QΣ^{−1/2} for any rotation Q, which is the cited non-uniqueness. After whitening, z̃ = Σ^{−1/2}(x − μ) has identity covariance and ‖z̃‖ = d_M(x).

**Worked numbers (Example A).** Σ = [[0.625, 0.375], [0.375, 0.625]], λ = (1, 0.25).
- Σ⁻¹ = v₁v₁ᵀ/1 + v₂v₂ᵀ/0.25 = [[0.5, 0.5], [0.5, 0.5]] + 4·[[0.5, −0.5], [−0.5, 0.5]] = [[2.5, −1.5], [−1.5, 2.5]].
- Σ^{−1/2} = v₁v₁ᵀ/1 + v₂v₂ᵀ/0.5 = [[1.5, −0.5], [−0.5, 1.5]]; squaring it gives [[2.5, −1.5], [−1.5, 2.5]] = Σ⁻¹. ✓
- Point q = (2, 2), on the long axis: Euclidean distance from the mean 2√2 ≈ 2.83; d_M² = (2, 2)·Σ⁻¹·(2, 2)ᵀ = (2, 2)·(2, 2)ᵀ = 8, so d_M ≈ 2.83 (2.83 standard deviations, since √λ₁ = 1).
- Point r = (1, −1), on the short axis: Euclidean distance √2 ≈ 1.41; d_M² = (1, −1)·(4, −4)ᵀ = 8, so d_M ≈ 2.83 again (1.41 / √0.25 = 2.83 standard deviations).
- Two points at very different Euclidean distances are at the *same* Mahalanobis distance: the cluster's ruler is short across the thin direction.

**Worked numbers (Example B).** Σ^{−1/2} = [[2.1942, −1.7848], [−1.7848, 2.2882]]; the whitened data have covariance [[1, 0], [0, 1]] to four decimals. For (6, 6) on the long axis: Euclidean 4.24, Mahalanobis 1.95; for (4, 2) off-axis: Euclidean 1.41, Mahalanobis 5.69. The off-axis point is Euclidean-closer but Mahalanobis-much-farther.

**Gaussian mixtures = many local frames with rulers.** A GMM is p(x) = Σ_k π_k N(x | μ_k, Σ_k) with N(x | μ, Σ) ∝ |Σ|^{−1/2} exp(−½ d_M(x; μ, Σ)²) (the cited "density determined by the Mahalanobis distance"). So component k *is* a local origin μ_k plus a local ruler Σ_k. EM alternates:
- E-step (soft assignment): responsibilities r_{nk} = π_k N(xₙ | μ_k, Σ_k) / Σ_j π_j N(xₙ | μ_j, Σ_j), the cited "partial membership".
- M-step: μ_k = Σₙ r_{nk} xₙ / Σₙ r_{nk} and Σ_k = Σₙ r_{nk}(xₙ − μ_k)(xₙ − μ_k)ᵀ / Σₙ r_{nk}, the cited responsibility-weighted mean and covariance. Σ_k is exactly the matrix whose eigenvectors are the local principal directions, so GMM fitting and local PCA are the same computation with soft weights.

**k-means versus GMM versus mixtures of PPCA.** k-means is the GMM with Σ_k = σ²I for all k and σ → 0: every cluster uses the same spherical Euclidean ruler, and the assignment is hard (the cited "diagonal, equal covariances of infinitesimally small variance" and "hard" GMM). A full-covariance GMM gives each cluster its own ruler but needs d(d + 1)/2 parameters per cluster, which is hopeless for a 6-point cluster in 300-D (Section 3). Tipping & Bishop's mixture of PPCA sits in between: each component has Σ_k = W_kW_kᵀ + σ_k²I, a q-dimensional local frame (the columns of W_k are scaled principal eigenvectors of the local responsibility-weighted covariance) plus isotropic noise, which is always invertible and has only dq + 1 − q(q − 1)/2 parameters. For the proposal this is the mathematically clean form of "each cluster is a local coordinate system": origin μ_k, axes W_k, and a ruler that is Mahalanobis inside the q-dimensional frame and Euclidean/σ_k outside it.

### Gaps
- The Neural Computation MPPCA paper's full text (with the mixture EM equations and responsibilities written out) was not retrieved; the JRSS-B companion paper that was retrieved describes the mixture (§4.2) and the single-component EM (Appendix B) but the mixture M-step formulas above are standard EM and were not quoted from the paper.
- No source was consulted on shrinkage estimators for singular covariances; the recommendation is an inference.

---

## 5. "Restricted domain and range so clusters don't overlap" = Voronoi cells / hard assignment; soft assignment as the alternative

### Takeaway
Giving each local frame a non-overlapping domain amounts to partitioning space into the Voronoi cells of the cluster centres (hard, nearest-centre assignment), which is exactly what k-means and Kambhatla & Leen's VQPCA do; the alternative is soft assignment by responsibilities, in which every point belongs to every frame with a weight and the frames' domains overlap.

### Cited Findings
- A Voronoi cell comprises "all points of the plane closer to that seed than to any other"; for point sites in Euclidean space "the Voronoi cells are convex polytopes", each an intersection of half-spaces; "Lloyd's algorithm and its generalization via the Linde–Buzo–Gray algorithm (aka k-means clustering) use the construction of Voronoi diagrams as a subroutine"; "Voronoi diagrams are used to do 1-NN classifications" — [Wikipedia, Voronoi diagram](https://en.wikipedia.org/wiki/Voronoi_diagram)
- k-means assigns each observation to the cluster with the nearest mean and "This results in a partitioning of the data space into Voronoi cells" — [Wikipedia, k-means clustering](https://en.wikipedia.org/wiki/K-means_clustering)
- VQPCA: "Perform a local PCA within each Voronoi cell of the VQ. For each cell, compute the local covariance matrix for the data with respect to the corresponding reference vector (centroid) r_c. Next compute the eigenvectors (e1, …, e_n) of each covariance matrix"; "project each data vector x onto the leading m eigenvectors to obtain the local linear coordinates z = (e1·(x − r_c), …, e_m·(x − r_c))"; "The encoding of x consists of the index c of the reference cell closest (Euclidean distance) to x, together with the m < n component vector z" — [Kambhatla & Leen, Fast Non-Linear Dimension Reduction, NIPS 1993, §3.1](https://papers.neurips.cc/paper_files/paper/1993/file/d554f7bb7be44a7267068a7df88ddd20-Paper.pdf)
- Their improved partition uses the "reconstruction distance" d(x, r_c) = (x − r_c)ᵀP_cᵀP_c(x − r_c), "the squared projection of the difference vector x − r_c on the trailing eigenvectors of the covariance matrix for the cell c", i.e. "the mean squared Euclidean distance between the data and the local hyperplane"; "Clustering with respect to the reconstruction distance directly minimizes the expected reconstruction error" — [Kambhatla & Leen, NIPS 1993, §3.2](https://papers.neurips.cc/paper_files/paper/1993/file/d554f7bb7be44a7267068a7df88ddd20-Paper.pdf)
- Soft assignment: in EM for mixtures each data point has a "partial membership" in every component (expectation values of the membership variables); hard versus soft is the contrast between assigning "only one exclusive pattern" and letting "any pattern … have certain 'ownership'" — [Wikipedia, Mixture model](https://en.wikipedia.org/wiki/Mixture_model)
- In a PPCA mixture "examples need not be shown in the plot if the corresponding component model has negligible conditional probability of having generated them", which "effectively implements a simultaneous automated clustering and visualization of data, which is much more powerful than simply subsetting the data by eye and performing individual PCAs" — [Tipping & Bishop, JRSS-B 1999, §4.2](https://www.cs.columbia.edu/~blei/seminar/2020-representation/readings/TippingBishop1999.pdf)

### Inferences

**Formalising the proposal's "restricted domain".** With centres c₁, …, c_K, define the label field ℓ(x) = argmin_k ‖x − c_k‖ and the cells V_k = {x : ℓ(x) = k}. The local frame of cluster k is the translation T_k(x) = x − c_k (optionally followed by the rotation V_kᵀ into principal coordinates) *restricted to the domain V_k*. Its range is the translated cell V_k − c_k, a convex region containing the origin. The cells tile the space without overlap (up to the measure-zero boundaries, which are pieces of the perpendicular-bisector hyperplanes between centres). This is precisely "restrict each frame's domain and range so frames of different clusters don't overlap", and it is identical to the encoder in VQPCA: cell index plus local coordinates.

**What distance defines the cells matters.** Euclidean nearest-centre gives flat-sided Voronoi polytopes. If instead each cluster's own ruler is used (nearest in Mahalanobis distance with Σ_k per cluster, as a GMM's hard assignment would), the boundaries become quadratic surfaces, because the difference of two quadratic forms is quadratic; and Kambhatla & Leen's "reconstruction distance" assigns a point to the cell whose local hyperplane it is closest to, which favours thin, elongated clusters over spherical ones. The proposal should decide which of these three it means by "nearest cluster".

**Hard versus soft.** Hard assignment (Voronoi) makes the local coordinates discontinuous at cell boundaries: a point just across a boundary jumps to a different origin and different axes. Soft assignment (responsibilities r_{nk}) lets a point carry coordinates in several frames at once, weighted by how plausibly each frame generated it; frames then overlap, and the overlap region is exactly where one could compare the frames (Section 6). Tipping & Bishop's remark that points are shown in a component's projection plot unless their responsibility is negligible is the soft version of "label each point by its cluster".

### Gaps
- The claim that Mahalanobis-based nearest-centre boundaries are quadrics was not fetched from a source (it is the standard quadratic-discriminant fact and follows from the algebra stated).

---

## 6. Manifold learning as the real home of "many local coordinate systems": charts, atlases, LTSA, LLE, mixtures of PPCA, Kambhatla–Leen

### Takeaway
"Many local coordinate systems, each valid on its own region" is the definition of an atlas of charts on a manifold; the literature splits into methods that stop at disjoint local frames (VQPCA, mixtures of local linear models, mixtures of PPCA), which buy a piecewise-linear description of curved data, and methods that use *overlapping* neighbourhoods plus an alignment step (LLE, LTSA) to glue the local frames into one global nonlinear coordinate system, which a single global linear frame can never provide.

### Cited Findings
- A chart is "a homeomorphism" from "an open subset" of M to an open subset of Euclidean space, written (U, φ); an atlas is "an indexed family" of charts "which covers M"; overlapping charts are compared by "the composition of one chart with the inverse of the other" (the transition map); "The pair formed by a chart and such a coordinate system is called a local coordinate system", also called a coordinate chart or local frame — [Wikipedia, Atlas (topology)](https://en.wikipedia.org/wiki/Atlas_(topology))
- Kambhatla & Leen: PCA "builds a global linear model of the data (an m dimensional hyperplane)"; "Our algorithm pieces together local linear coordinate patches. The local regions are defined by the partition of the input space induced by a vector quantizer (VQ). The orientation of the local coordinates is determined by PCA"; their Figure 2 shows "the two principal eigen-directions in each Voronoi cell" for data on a hemisphere; "The VQPCA encodings have significantly lower reconstruction error than the global PCA or five layer nets" — [Kambhatla & Leen, NIPS 1993](https://papers.neurips.cc/paper_files/paper/1993/file/d554f7bb7be44a7267068a7df88ddd20-Paper.pdf); the journal version is "Dimension Reduction by Local Principal Component Analysis", Neural Computation 9(7):1493–1516, 1997, DOI 10.1162/NECO.1997.9.7.1493, "a local linear approach to dimension reduction" — [MLAnthology record](https://mlanthology.org/neco/1997/kambhatla1997neco-dimension)
- Tipping & Bishop 1999 (Neural Computation 11(2):443–482): PCA's "effectiveness is limited by its global linearity"; the mixture of PPCA models captures complex data through "local linear projections"; it is "a well-defined mixture model for probabilistic principal component analyzers, whose parameters can be determined using an expectation-maximization algorithm", with applications to "clustering, density modeling, and local dimensionality reduction" — [MLAnthology record](https://mlanthology.org/neco/1999/tipping1999neco-mixtures); [Aston research portal](https://research.aston.ac.uk/en/publications/mixtures-of-probabilistic-principal-component-analysers/)
- LLE (Roweis & Saul, Science 290:2323–2326, 2000): the data "assumed to lie on a nonlinear manifold, is mapped into a single global coordinate system of lower dimensionality"; "mixture models for local dimensionality reduction [Fukunaga and Olsen (1971), Ghahramani and Hinton (1996), Kambhatla and Leen (1997)], which cluster the data and perform PCA within each cluster, do not address the problem considered here—namely, how to map high dimensional data into a single global coordinate system of lower dimensionality" — [Saul & Roweis, LLE technical report MS CIS-02-18](https://cs.nyu.edu/home/people/in_memoriam/roweis/papers/lle_tr02.pdf); [Science abstract](https://cs.nyu.edu/home/people/in_memoriam/roweis/papers/sciabs.txt)
- LLE's local step: "we expect each data point and its neighbors to lie on or close to a locally linear patch of the manifold"; reconstruction weights minimise E(W) = Σᵢ ‖Xᵢ − Σⱼ WᵢⱼXⱼ‖²; the weights "are invariant to rotations, rescalings, and translations of that data point and its neighbors", where "the invariance to translations is enforced by the sum-to-one constraint on the rows of the weight matrix"; hence the weights "characterize intrinsic geometric properties of each neighborhood, as opposed to properties that depend on a particular frame of reference" — [Saul & Roweis, LLE TR](https://cs.nyu.edu/home/people/in_memoriam/roweis/papers/lle_tr02.pdf)
- LLE's global step: "the bottom d non-zero eigenvectors of an easily computed matrix provide an ordered set of embedding coordinates"; "the embedding coordinates are computed by an N × N eigensolver, a global operation that couples all data points … This is how the algorithm discovers global structure—by integrating information from overlapping local neighborhoods" — [Saul & Roweis, LLE TR](https://cs.nyu.edu/home/people/in_memoriam/roweis/papers/lle_tr02.pdf)
- LTSA (Zhang & Zha, SIAM J. Sci. Comput. 26:313–338, 2004): the local geometry is represented by "tangent spaces learned by fitting an affine subspace in a neighborhood of each data point", and "Those tangent spaces are aligned to give the internal global coordinates" via "a partial eigendecomposition of the neighborhood connection matrix" — [arXiv cs/0212008](https://arxiv.org/abs/cs/0212008); the intuition is that "when a manifold is correctly unfolded, all of the tangent hyperplanes to the manifold will become aligned", and the method "computes the tangent space at every point by computing the d-first principal components in each local neighborhood" — [Wikipedia, Local tangent space alignment](https://en.wikipedia.org/wiki/Local_tangent_space_alignment)

### Inferences

**The proposal is an atlas, minus the overlaps.** A chart φ_k : U_k → R^q is a local coordinate system valid on an open region U_k; an atlas is a set of charts whose regions cover the data. The proposal's "coordinate system per cluster, restricted to its region, with every point labelled by its system" is an atlas whose regions are the Voronoi cells. The one structural difference from the mathematical definition is that charts are required to *overlap* (open sets covering a connected manifold must overlap), and on each overlap the transition map φ_j ∘ φ_k⁻¹ says how to convert coordinates from one chart to the other. Disjoint Voronoi cells have empty overlaps and therefore no transition maps: coordinates in different cells cannot be compared, which is exactly the limitation Roweis & Saul attribute to "mixture models for local dimensionality reduction".

**Fitting an affine subspace = local PCA about the neighbourhood mean.** LTSA's "fitting an affine subspace in a neighborhood" is: take the neighbourhood's points, subtract their mean, and keep the top-q right singular vectors (Section 3). That is the proposal's step (1)+(2) done at *every point* with its own neighbourhood, rather than once per cluster. The tangent space is a linear subspace through the local origin (the mean), and the "straight paths" of the proposal are, in this language, tangent directions.

**Why LLE's weights are the clean version of "frame-free local geometry".** The sum-to-one constraint Σⱼ Wᵢⱼ = 1 makes Σⱼ Wᵢⱼ(Xⱼ + b) = (ΣⱼWᵢⱼXⱼ) + b, so shifting the origin leaves the reconstruction error unchanged: the weights describe how a point sits among its neighbours without reference to any origin at all. This is the general lesson for the proposal: quantities worth computing in a local frame should be the ones that do not depend on *which* local origin was chosen (covariance eigenvectors about the mean, Mahalanobis distances, reconstruction weights), rather than raw coordinates.

**What an atlas of local frames buys over one global frame.**
1. *Curvature.* A single linear frame (global PCA) fits one hyperplane; data on a curved sheet (a hemisphere, Kambhatla & Leen's figure) is approximated far better by several small flat patches, giving "significantly lower reconstruction error" at the same number of coordinates.
2. *Local dimension and local metric.* Each patch can have its own q and its own ruler Σ_k; a blob-like cluster and a path-like cluster need not share a model.
3. *Density.* In the probabilistic version (mixture of PPCA) the atlas is also a likelihood, so one can score points, handle missing values, and choose the number and dimension of patches by model comparison (Tipping & Bishop's "controlling the degrees of freedom").
4. *Global nonlinear coordinates.* Only when patches overlap and are aligned (LLE's eigensolver "integrating information from overlapping local neighborhoods"; LTSA's alignment of tangent spaces) does one obtain a single coordinate system in which distances across patches are meaningful. This is the thing a global linear frame cannot provide and a disjoint-cells atlas does not provide either.

**What it costs.** More parameters (overfitting risk, Tipping & Bishop's parameter counts), discontinuities at hard boundaries, and the need for enough points per patch that the local covariance is not a rank-(m − 1) tautology (Section 3). LTSA/LLE need neighbourhoods of order 2q points on a well-sampled manifold ("each data point has on the order of 2d neighbors which define a roughly linear patch").

### Gaps
- Only the abstract of Zhang & Zha 2004 and the Wikipedia summary were retrieved; the alignment-matrix construction and the statement that the global coordinates come from its null space / smallest eigenvectors appear in a search snippet citing Ye, Zha & Li (BIT 2007) and were not verified in the primary text.
- Kambhatla & Leen 1997 was available only as an abstract; algorithmic quotations are from their 1993 NIPS paper, which the 1997 paper extends.

---

## 7. Clustering objectives: k-means, k-medoids, and why k-means minimises the sum of local PCA eigenvalues

### Takeaway
k-means minimises the within-cluster sum of squared distances to the centroid, which for each cluster equals m_k times the trace of its (1/m-normalised) centred covariance, i.e. m_k times the sum of its local PCA eigenvalues; k-medoids instead minimises a sum of (unsquared, arbitrary) dissimilarities to a data point, and that data point, the medoid, is exactly the proposal's "centre-most point".

### Cited Findings
- k-means aims to "minimize the within-cluster sum of squares (WCSS) (i.e. variance)", which "is equivalent to minimizing the pairwise squared deviations of points in the same cluster" — [Wikipedia, k-means clustering](https://en.wikipedia.org/wiki/K-means_clustering)
- k-medoids partitions n objects into k clusters and "minimizes a sum of pairwise dissimilarities" to the medoid rather than squared distances; the medoid is "the most centrally located point in the cluster"; k-medoids "chooses actual data points as centers" whereas k-means "only optimizes squared Euclidean distance"; the name was coined by Kaufman & Rousseeuw with the PAM (Partitioning Around Medoids) algorithm; k-medoids is "more robust to noise and outliers than k-means" — [Wikipedia, k-medoids](https://en.wikipedia.org/wiki/K-medoids)
- "It has been asserted that the relaxed solution of k-means clustering, specified by the cluster indicators, is given by the principal components, and the PCA subspace spanned by the principal directions is identical to the cluster centroid subspace. However, … it is straightforward to uncover counterexamples to the statement that the cluster centroid subspace is spanned by the principal directions" — [Wikipedia, Principal component analysis](https://en.wikipedia.org/wiki/Principal_component_analysis)
- The PPCA sample covariance is S = (1/N) Σₙ (tₙ − μ)(tₙ − μ)ᵀ with μ the sample mean — [Tipping & Bishop, JRSS-B 1999, eq. (5)](https://www.cs.columbia.edu/~blei/seminar/2020-representation/readings/TippingBishop1999.pdf)

### Inferences

**k-means objective = total within-cluster variance = sum of local eigenvalues.** For cluster k with m_k points, mean μ_k and scatter S_k = (1/m_k) Σ (xᵢ − μ_k)(xᵢ − μ_k)ᵀ:

```
Σ_{i∈k} ‖xᵢ − μ_k‖² = Σ_{i∈k} tr[(xᵢ − μ_k)(xᵢ − μ_k)ᵀ] = m_k · tr(S_k) = m_k · Σ_j λ_j^{(k)} ,
```

using ‖v‖² = tr(vvᵀ), linearity of the trace, and the fact that the trace of a symmetric matrix is the sum of its eigenvalues. Summing over clusters, WCSS = Σ_k m_k Σ_j λ_j^{(k)}: k-means chooses the partition whose local PCA spectra have the smallest size-weighted total. Numeric checks: Example A gives Σ‖pᵢ − μ‖² = 5 = 4 × 1.25; Example B gives 19.5 = 4 × 4.875 with the 1/(m − 1) covariance (equivalently 5 × 3.9 with 1/m).

**Pairwise form.** Σᵢ ‖xᵢ − μ‖² = (1/(2m)) Σᵢ Σⱼ ‖xᵢ − xⱼ‖² (expand the right-hand side using Σᵢ(xᵢ − μ) = 0); this is the cited "pairwise squared deviations" equivalence and shows the k-means objective can be written without ever naming a centre.

**Two different "centre-most points".** Under squared Euclidean distance, Σⱼ ‖x − xⱼ‖² = m‖x − μ‖² + Σⱼ ‖xⱼ − μ‖², so the data point minimising the sum of *squared* distances is simply the data point nearest the centroid. Under plain distance (k-medoids' usual choice), the minimiser of Σⱼ ‖x − xⱼ‖ is the medoid, a geometric-median-like point that is less pulled by outliers. These can be different points; in Example B both coincide at (3, 2.5) (sum of distances 8.50 versus 9.21 and 9.96 for its neighbours). The proposal's "centre-most point" is the medoid in the k-medoids sense; the proposal should say which distance it means.

**Where the centroid and medoid enter the frame construction.** The centroid is the origin about which the covariance (hence the principal directions, hence the k-means objective) is defined. The medoid is a *representative*: a real data point one can point to, robust to outliers, and natural as an origin for display or for "paths into the origin". Using the medoid as origin for the coordinates while using the centroid for the covariance is consistent; using the medoid for the covariance adds the rank-one term of Section 1.

**k-means and PCA.** The claim that PCA gives the continuous relaxation of k-means is, per the cited passage, asserted in the literature but has counterexamples for the strong form; the safe statement is the trace identity above, which is exact.

### Gaps
- The squared-distance-medoid identity and the trace identity are derivations here, verified numerically but not quoted from a source.

---

## 8. Verdict on the proposal, and how the pieces plug into a high-dimensional embedding cluster

### Takeaway
Step (1) is standard mathematics under other names (medoid, translation to a local origin, Voronoi partition, local PCA / VQPCA, mixture of local linear models); step (2) is true only after rewording ("the principal directions are eigenvectors of the cluster's centred covariance", and "points on a line through the local origin are the 1-eigenspace of the projection uuᵀ"), and false as stated for lines not through the origin or for points taken as "eigenvectors" without naming a matrix; step (3) generalises without change in the formulas but collapses into a tautology when a cluster has fewer points than dimensions.

### Cited Findings
- The ingredients and their standard names are documented above: medoid — [Wikipedia, k-medoids](https://en.wikipedia.org/wiki/K-medoids); translation as affine not linear, and fixed point as origin — [Wikipedia, Affine transformation](https://en.wikipedia.org/wiki/Affine_transformation); Voronoi cells and nearest-centre assignment — [Wikipedia, Voronoi diagram](https://en.wikipedia.org/wiki/Voronoi_diagram), [Wikipedia, k-means clustering](https://en.wikipedia.org/wiki/K-means_clustering); local PCA within Voronoi cells with centroid origin and local coordinates z = (e₁·(x − r_c), …) — [Kambhatla & Leen 1993](https://papers.neurips.cc/paper_files/paper/1993/file/d554f7bb7be44a7267068a7df88ddd20-Paper.pdf); probabilistic mixture version — [Tipping & Bishop 1999](https://mlanthology.org/neco/1999/tipping1999neco-mixtures); projection eigenvalues 0/1 with range and kernel as eigenspaces — [Wikipedia, Projection (linear algebra)](https://en.wikipedia.org/wiki/Projection_(linear_algebra)); eigenvalue definition and eigenspace as subspace — [Wikipedia, Eigenvalues and eigenvectors](https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors); PCA requires centring, components are covariance eigenvectors — [Wikipedia, PCA](https://en.wikipedia.org/wiki/Principal_component_analysis).

### Inferences

**Statement-by-statement verdict.**

| Proposal statement | Status | Precise version |
|---|---|---|
| Pick a "centre-most point" per cluster | Standard (renaming) | The medoid: the data point minimising the sum of distances to the cluster (k-medoids / PAM). Decide squared vs plain distance. |
| Make it a local origin; represent nearby points as vectors in that frame | Standard | The translation x ↦ x − c, an affine map; local coordinates z = Vᵀ(x − c). This is VQPCA's encoder. |
| Restrict each frame's domain/range so frames don't overlap; label points by nearest cluster | Standard (renaming) | Hard assignment on the Voronoi cells of the centres; the label field is argmin_k ‖x − c_k‖. Soft responsibilities are the alternative; disjoint cells have no transition maps. |
| Points on a straight path into the origin are "eigenvectors" | Needs rewording | Points on the line L = span(u) through the origin are scalar multiples of u, so L is the 1-eigenspace of P = uuᵀ (and the s-eigenspace of I + (s − 1)uuᵀ, etc.). Eigenvector-ness is a property of the chosen matrix; without naming it the sentence is empty. |
| … "of a matrix transformation that models the straight line they lie on" | Correct if the matrix is named | The orthogonal projection uuᵀ is the canonical "matrix of the line" (rank 1, idempotent, range = L). Any rank-one uwᵀ also has column space L. |
| The same for a path that does not go through the origin | False as stated | Such a line is not a subspace, so it is no eigenspace. Fix: translate so it passes through the origin, or treat its points as fixed points (eigenvalue-1 eigenvectors in homogeneous coordinates) of the affine projection x ↦ Px + (I − P)p. |
| "Eigenvectors of the line" as a way to find the cluster's internal directions | Needs rewording | The data-determined directions are the eigenvectors of the cluster's *mean-centred covariance* S; eigenvalues are the variances along them. Centring on the medoid instead adds (μ − c)(μ − c)ᵀ and tilts them. |
| Generalise to many dimensions | Correct, with a caveat | All formulas are dimension-free. But rank(S) ≤ m − 1, so a cluster of m ≪ d points spans an (m − 1)-flat regardless of its content; only the spectrum shape, judged against a null model, carries information, and Σ⁻¹ needs regularisation (PPCA's WWᵀ + σ²I). |

**Plugging the pieces into a high-dimensional embedding cluster (one paragraph, no NLP literature).** Given m vectors x₁, …, xₘ in R^d (say m = 6, d = 300) that some clustering has grouped: compute the mean μ and, if a representative is wanted, the medoid c; form X_c and its thin SVD to get V_q and λ₁ ≥ … ≥ λ_{m−1} > 0 = λ_m = … (at most m − 1 nonzero); report the local coordinates z = V_qᵀ(x − μ) and the variance fractions λ_k/Σλ; test a candidate "straight path" direction u by the residual ‖(I − uuᵀ)(x − μ)‖ for each point (zero exactly when the point lies on the line through μ in direction u, which is the 1-eigenspace of uuᵀ); use a Mahalanobis ruler only with a regularised covariance such as V_q(Λ_q − σ²I)V_qᵀ + σ²I with σ² the mean discarded eigenvalue; assign other points to this frame either hard (Voronoi) or by responsibilities under a mixture of PPCA; and compare every spectral statistic with the same computation on random m-subsets, because with m − 1 < d the existence of a low-dimensional local frame is guaranteed by counting alone. One further caution specific to embedding spaces: angles and cosines are measured from the global origin, and a translation to a local origin changes every angle, so "similarity" inside a local frame is a different quantity from similarity in the global frame; the LLE-style quantities that are invariant to the choice of origin (centred covariance eigenvectors, Mahalanobis distances, reconstruction weights) are the safe ones to report.

### Gaps
- Bishop's *Pattern Recognition and Machine Learning* (chapters on PCA, mixtures and k-means) was not fetched; nothing above is attributed to it, though it covers the GMM/EM and PPCA material in the same notation as Tipping & Bishop.
- No source was consulted on word-embedding-specific issues (by design); the final paragraph is an application of the linear algebra above, not a literature finding.
