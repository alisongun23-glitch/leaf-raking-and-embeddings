#!/usr/bin/env python3
"""
kinship_pca.py -- local PCA of a kinship cluster in pretrained word embeddings.

Pre-registered design (words, labels, statistics, nulls):
  research_notes/Local origins in word embeddings/experiments_and_pitfalls.md  (Key questions 2, 3, 6)
  reports/Local origins in word embeddings.md                                   (section "An afternoon's experiment")

Usage (from the project root; the vector file is untrusted data, so run with -I and pass its path):
  python -I experiments/kinship-pca/kinship_pca.py --gensim glove-wiki-gigaword-300 --out experiments/kinship-pca --seed 0
  python -I experiments/kinship-pca/kinship_pca.py --vectors /path/to/glove.6B.300d.txt --out experiments/kinship-pca --seed 0

Outputs (in --out): results.json, results_tables.md, pc_scatter_male8.png, pc_scatter_mixed15.png, evr_spectrum_null.png
"""
import argparse
import gzip
import itertools
import json
import math
import os
import sys
import time
from collections import Counter

import numpy as np
from scipy.stats import rankdata

# ---------------------------------------------------------------------------
# Pre-registered word sets and labels. Fixed before any vector was looked at.
# ---------------------------------------------------------------------------
MALE8 = ["grandfather", "father", "son", "grandson", "uncle", "brother", "nephew", "cousin"]
MALE8_GEN = [2, 1, -1, -2, 1, 0, -1, 0]            # generation relative to ego (Wallace-Atkins, signed)
MALE8_LIN = [1, 1, 1, 1, 0, 0, 0, 0]               # 1 = lineal, 0 = collateral
MALE8_ABSGEN = [abs(g) for g in MALE8_GEN]         # generation distance (Romney-D'Andrade)

FEMALE7 = ["grandmother", "mother", "daughter", "granddaughter", "aunt", "sister", "niece"]
FEMALE7_GEN = [2, 1, -1, -2, 1, 0, -1]
FEMALE7_LIN = [1, 1, 1, 1, 0, 0, 0]
MALE7 = MALE8[:7]                                  # male set minus the sex-unmarked "cousin"
MALE7_GEN = MALE8_GEN[:7]
MALE7_LIN = MALE8_LIN[:7]

MIXED15 = ["grandfather", "grandmother", "father", "mother", "uncle", "aunt", "brother", "sister",
           "cousin", "son", "daughter", "nephew", "niece", "grandson", "granddaughter"]
MIXED15_GEN = [2, 2, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1, -2, -2]
MIXED15_LIN = [1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1]
MIXED15_ABSGEN = [abs(g) for g in MIXED15_GEN]
MIXED15_SEX = [1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]       # 1 = male, 0 = female; cousin is unmarked ->
MIXED15_SEX_MASK = [True] * 8 + [False] + [True] * 6             # excluded from the sex correlation (PCA still uses it)
MIXED15_SEX3 = [1, -1, 1, -1, 1, -1, 1, -1, 0, 1, -1, 1, -1, 1, -1]  # secondary: 3-level ordinal with cousin = 0

# Supervised axes (notes, Key question 2 step 6; skeleton add-on C). Pairs are (older, younger).
MALE_GEN_PAIRS = [("father", "son"), ("grandfather", "father"), ("grandfather", "grandson"), ("uncle", "nephew")]
FEMALE_GEN_PAIRS = [("mother", "daughter"), ("grandmother", "mother"), ("grandmother", "granddaughter"), ("aunt", "niece")]
MALE_LINEAL, MALE_COLLATERAL = ["grandfather", "father", "son", "grandson"], ["uncle", "brother", "nephew", "cousin"]
FEMALE_LINEAL, FEMALE_COLLATERAL = ["grandmother", "mother", "daughter", "granddaughter"], ["aunt", "sister", "niece", "cousin"]
SKELETON_FEMALE6 = ["mother", "daughter", "grandmother", "granddaughter", "aunt", "niece"]   # add-on C exactly as written
SKELETON_FEMALE6_GEN = [1, -1, 2, -2, 1, -1]

OFFSET_TESTS = [  # (name, (a, b), (c, d), null shape): cos(a - b, c - d)
    ("cos(father-son, grandfather-father)", ("father", "son"), ("grandfather", "father"), "chain"),
    ("cos(mother-daughter, grandmother-mother)", ("mother", "daughter"), ("grandmother", "mother"), "chain"),
    ("cos(uncle-nephew, father-son)", ("uncle", "nephew"), ("father", "son"), "disjoint"),
    ("cos(father-son, mother-daughter)", ("father", "son"), ("mother", "daughter"), "disjoint"),
    # EXPLORATORY, added after seeing the chain cosines in a smoke test: is the "grand-" step a shared offset?
    ("[exploratory] cos(grandfather-father, grandson-son)", ("grandfather", "father"), ("grandson", "son"), "disjoint"),
]
ANALOGIES = [  # a : a* :: b : ?  (expected answer)
    ("father", "son", "grandfather", "grandson"),
    ("father", "son", "mother", "daughter"),
    ("father", "uncle", "mother", "aunt"),
]
ALL_KIN = sorted(set(MIXED15))
K_TOP = 3  # number of top PCs scored against labels (the max-statistic runs over these)


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def _has_header(path):
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8", errors="replace") as fh:
        first = fh.readline().split()
    return len(first) == 2 and all(t.isdigit() for t in first)


def load_vectors(args):
    if args.gensim:
        import gensim.downloader as api
        # return_path=True downloads (if needed) and returns the file path; it does NOT import the
        # downloaded directory's __init__.py, so no code from the data directory is executed.
        path = api.load(args.gensim, return_path=True)
    else:
        path = args.vectors
    from gensim.models import KeyedVectors
    kv = KeyedVectors.load_word2vec_format(path, binary=False, no_header=not _has_header(path), limit=args.limit)
    return kv, path


# ---------------------------------------------------------------------------
# Linear algebra and statistics helpers
# ---------------------------------------------------------------------------
def unit(X):
    return X / np.linalg.norm(X, axis=-1, keepdims=True)


def pca(X, centre):
    """SVD of the centred matrix. Returns scores (m x r), directions (rows of Vt), EVR, eigenvalues."""
    U, s, Vt = np.linalg.svd(X - centre, full_matrices=False)
    return U * s, Vt, s ** 2 / np.sum(s ** 2), s ** 2 / (X.shape[0] - 1)


def medoid_index(X):
    D = np.linalg.norm(X[:, None, :] - X[None, :, :], axis=2)
    return int(np.argmin(D.sum(1)))


def orient(scores, Vt, ref):
    """Eigenvector sign convention: the reference word (grandfather) scores >= 0 on every PC."""
    for k in range(Vt.shape[0]):
        s = np.sign(scores[ref, k])
        if s == 0:
            s = np.sign(scores[np.argmax(np.abs(scores[:, k])), k]) or 1.0
        if s < 0:
            scores[:, k] *= -1
            Vt[k] *= -1
    return scores, Vt


def pearson_rows(x, L):
    """Pearson r between vector x (m,) and every row of L (N, m)."""
    xc = x - x.mean()
    Lc = L - L.mean(axis=1, keepdims=True)
    den = np.linalg.norm(Lc, axis=1) * np.linalg.norm(xc)
    with np.errstate(invalid="ignore", divide="ignore"):
        r = (Lc @ xc) / den
    return np.nan_to_num(r)


def rank_rows(L, base):
    """Average ranks of every row of L, each row being a rearrangement of `base` (ties get average ranks)."""
    base = np.asarray(base)
    rb = rankdata(base)
    uniq, inv = np.unique(L, return_inverse=True)
    ranks_u = np.array([rb[base == v][0] for v in uniq])
    return ranks_u[inv].reshape(L.shape)


def spearman(x, y):
    return float(pearson_rows(rankdata(x), rankdata(y)[None, :])[0])


def signed_corr(x, lab, kind):
    """Spearman rho for an ordinal label, point-biserial (Pearson) r for a binary one."""
    if kind == "ordinal":
        return spearman(x, lab)
    return float(pearson_rows(np.asarray(x, float), np.asarray(lab, float)[None, :])[0])


def abs_corr_matrix(S, L, kind, base):
    """|corr| between each column of S (m x K) and each row of L (N x m) -> (N x K)."""
    if kind == "ordinal":
        R = rank_rows(L, base)
        return np.column_stack([np.abs(pearson_rows(rankdata(S[:, k]), R)) for k in range(S.shape[1])])
    return np.column_stack([np.abs(pearson_rows(S[:, k], L.astype(float))) for k in range(S.shape[1])])


def n_distinct(lab):
    n = math.factorial(len(lab))
    for c in Counter(lab).values():
        n //= math.factorial(c)
    return n


def distinct_labellings(lab):
    """Every distinct rearrangement of the label multiset, as an (N x m) array."""
    lab = list(lab)
    m = len(lab)
    groups = sorted(Counter(lab).items())
    out, cur = [], [None] * m

    def rec(remaining, gi):
        if gi == len(groups):
            out.append(cur.copy())
            return
        v, c = groups[gi]
        for pos in itertools.combinations(remaining, c):
            for p in pos:
                cur[p] = v
            ps = set(pos)
            rec([q for q in remaining if q not in ps], gi + 1)

    rec(list(range(m)), 0)
    return np.array(out)


def perm_test(S, lab, kind, rng, n_mc, max_exact):
    """Permutation null for |corr(PC_k, label)| (k = 1..K) and for max_k |corr| (the search is inside the null).
    All distinct labellings are enumerated exactly when their number is <= max_exact (p = count/total, the
    observed labelling is one of them); otherwise n_mc random shuffles with the Phipson-Smyth (b+1)/(M+1)."""
    lab = np.asarray(lab)
    obs = abs_corr_matrix(S, lab[None, :], kind, lab)[0]
    N = n_distinct(list(lab))
    eps = 1e-12
    if N <= max_exact:
        null = abs_corr_matrix(S, distinct_labellings(lab), kind, lab)
        p_pc = (null >= obs[None, :] - eps).mean(0)
        p_max = (null.max(1) >= obs.max() - eps).mean()
        n, null_kind = N, "exact"
    else:
        L = np.stack([rng.permutation(lab) for _ in range(n_mc)])
        null = abs_corr_matrix(S, L, kind, lab)
        p_pc = ((null >= obs[None, :] - eps).sum(0) + 1) / (n_mc + 1)
        p_max = ((null.max(1) >= obs.max() - eps).sum() + 1) / (n_mc + 1)
        n, null_kind = n_mc, "montecarlo"
    return dict(obs_abs=obs.tolist(), p_pc=[float(p) for p in p_pc], max_obs=float(obs.max()),
                argmax_pc=int(obs.argmax()) + 1, p_max=float(p_max), n_labellings=int(n),
                N_distinct=int(N), null_kind=null_kind)


# ---------------------------------------------------------------------------
# Experiment blocks
# ---------------------------------------------------------------------------
def leave_one_out(Xn, words, centre_name, Vt_full):
    rows = []
    for i, w in enumerate(words):
        Xi = np.delete(Xn, i, 0)
        others = [ww for k, ww in enumerate(words) if k != i]
        if centre_name == "mean":
            c, med = Xi.mean(0), None
        else:
            j = medoid_index(Xi)
            c, med = Xi[j], others[j]
        _, Vt_i, _, _ = pca(Xi, c)
        c1 = abs(float(Vt_i[0] @ Vt_full[0]))
        c2 = abs(float(Vt_i[1] @ Vt_full[1]))
        x12 = abs(float(Vt_i[0] @ Vt_full[1]))
        plane = float(np.linalg.svd(Vt_full[:2] @ Vt_i[:2].T, compute_uv=False).min())  # cos of largest principal angle
        rows.append(dict(drop=w, cos_pc1=c1, cos_pc2=c2, cos_pc1_vs_full_pc2=x12, plane_cos=plane,
                         swap=bool(x12 > c1), medoid=med))
    return rows


def analyse_set(words, X, labels, ref_word, ranks, rng, n_mc, max_exact):
    """Unsupervised local PCA for {unit, raw} x {mean, medoid}, scored against every pre-registered label."""
    m, ref = len(words), words.index(ref_word)
    out = {}
    for norm_name in ("unit", "raw"):
        Xn = unit(X) if norm_name == "unit" else X.copy()
        mu, j = Xn.mean(0), medoid_index(Xn)
        for centre_name in ("mean", "medoid"):
            c = mu if centre_name == "mean" else Xn[j]
            scores, Vt, evr, lam = pca(Xn, c)
            scores, Vt = orient(scores, Vt, ref)
            res = dict(norm=norm_name, centre=centre_name, medoid_word=words[j],
                       evr=evr[: m - 1].tolist(), lam=lam[: m - 1].tolist(),
                       gap12=float(lam[0] / lam[1]), gap23=float(lam[1] / lam[2]),
                       rel_gap=float((lam[0] - lam[1]) / lam[0]),
                       scores=scores[:, :K_TOP].tolist(),
                       rho_logrank=[spearman(scores[:, k], np.log(np.asarray(ranks, float))) for k in range(K_TOP)],
                       labels={})
            if centre_name == "medoid":
                d = mu - Xn[j]
                res["cos_pc1_mean_minus_medoid"] = float(abs(Vt[0] @ d) / np.linalg.norm(d))
                res["dist_mean_medoid"] = float(np.linalg.norm(d))
            for lb in labels:
                mask = np.asarray(lb.get("mask", [True] * m))
                S, vals = scores[mask, :K_TOP], np.asarray(lb["values"])[mask]
                pt = perm_test(S, vals, lb["kind"], rng, n_mc, max_exact)
                pt["signed"] = [signed_corr(S[:, k], vals, lb["kind"]) for k in range(K_TOP)]
                pt["kind"] = lb["kind"]
                res["labels"][lb["name"]] = pt
            res["loo"] = leave_one_out(Xn, words, centre_name, Vt)
            out[f"{norm_name}/{centre_name}"] = res
    return out


def draw_matched_set(ranks, rng, ok, exclude):
    """One random word per kinship word, drawn uniformly from the frequency-rank band [r/2, 2r] of that word
    (0-based vocabulary index r), restricted to alphabetic tokens, excluding kinship words and repeats."""
    V, picked = len(ok), []
    for r in ranks:
        lo, hi = max(1, r // 2), min(2 * r + 1, V - 1)
        for _ in range(100000):
            i = int(rng.integers(lo, hi + 1))
            if ok[i] and i not in exclude and i not in picked:
                picked.append(i)
                break
        else:
            raise RuntimeError(f"could not draw a frequency-matched word for rank {r}")
    return picked


def random_set_null(E, ranks, labels, n_sets, rng, ok, exclude):
    m = len(ranks)
    rec = {nm: dict(evr=[], best={lb["name"]: [] for lb in labels}, words=[]) for nm in ("unit", "raw")}
    for _ in range(n_sets):
        idx = draw_matched_set(ranks, rng, ok, exclude)
        X = E[idx].astype(np.float64)
        for nm in ("unit", "raw"):
            Xn = unit(X) if nm == "unit" else X
            scores, _, evr, _ = pca(Xn, Xn.mean(0))
            rec[nm]["evr"].append(evr[: m - 1].tolist())
            rec[nm]["words"].append(idx)
            for lb in labels:
                mask = np.asarray(lb.get("mask", [True] * m))
                S, vals = scores[mask, :K_TOP], np.asarray(lb["values"])[mask]
                rec[nm]["best"][lb["name"]].append(max(abs(signed_corr(S[:, k], vals, lb["kind"])) for k in range(K_TOP)))
    return rec


def compare_to_null(obs, null):
    null = np.asarray(null, float)
    return dict(obs=float(obs), null_median=float(np.median(null)), null_q05=float(np.percentile(null, 5)),
                null_q95=float(np.percentile(null, 95)), null_max=float(null.max()),
                percentile=float(100 * np.mean(null < obs)), p=float((np.sum(null >= obs) + 1) / (len(null) + 1)))


def build_gen_axis(vec, pairs, method):
    diffs = unit(np.stack([vec(a) - vec(b) for a, b in pairs]))
    axis = np.linalg.svd(diffs, full_matrices=False)[2][0] if method == "pc1" else diffs.mean(0)
    axis = axis / np.linalg.norm(axis)
    return axis * np.sign(axis @ diffs[0])      # orient: older > younger


def build_lin_axis(vec, lineal, collateral):
    a = np.mean([vec(w) for w in lineal], 0) - np.mean([vec(w) for w in collateral], 0)
    return a / np.linalg.norm(a)


def transfer_test(axis, Xtest, lab, kind, rng, n_dirs, max_exact):
    proj = Xtest @ axis
    obs = signed_corr(proj, lab, kind)
    pt = perm_test(proj[:, None], lab, kind, rng, 20000, max_exact)          # label-permutation null
    D = unit(rng.standard_normal((n_dirs, Xtest.shape[1])))                    # random-direction null
    P = Xtest @ D.T                                                            # (m, n_dirs)
    if kind == "ordinal":
        null = np.abs(pearson_rows(rankdata(lab), rankdata(P, axis=0).T))
    else:
        null = np.abs(pearson_rows(np.asarray(lab, float), P.T))
    return dict(corr=obs, p_perm=pt["p_pc"][0], n_perm=pt["n_labellings"], perm_kind=pt["null_kind"],
                p_dir=float((np.sum(null >= abs(obs) - 1e-12) + 1) / (n_dirs + 1)),
                null_dir_q95=float(np.percentile(null, 95)), null_dir_q99=float(np.percentile(null, 99)),
                proj=[float(v) for v in proj])


def offset_block(E, Eu, k2i, pool, rng, n_null):
    out = {}
    for nm, M in (("raw", E), ("unit", Eu)):
        def cosv(a, b):
            return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
        tests = []
        for name, (a, b), (c, d), shape in OFFSET_TESTS:
            tests.append(dict(name=name, shape=shape,
                              cos=cosv(M[k2i[a]] - M[k2i[b]], M[k2i[c]] - M[k2i[d]])))
        # empirical nulls from random vocabulary words (top-50k alphabetic pool)
        idx = rng.choice(pool, size=(n_null, 4), replace=True)
        idx = idx[np.array([len(set(r)) == 4 for r in idx])]
        A, B, C, Dd = (M[idx[:, i]].astype(np.float64) for i in range(4))
        disjoint = np.einsum("ij,ij->i", A - B, C - Dd) / (np.linalg.norm(A - B, axis=1) * np.linalg.norm(C - Dd, axis=1))
        chain = np.einsum("ij,ij->i", A - B, C - A) / (np.linalg.norm(A - B, axis=1) * np.linalg.norm(C - A, axis=1))
        nulls = dict(disjoint=disjoint, chain=chain)
        for t in tests:
            nl = nulls[t["shape"]]
            t.update(null_mean=float(nl.mean()), null_sd=float(nl.std()), null_q025=float(np.percentile(nl, 2.5)),
                     null_q975=float(np.percentile(nl, 97.5)), percentile=float(100 * np.mean(nl < t["cos"])),
                     p_right=float((np.sum(nl >= t["cos"]) + 1) / (len(nl) + 1)), n_null=int(len(nl)))
        out[nm] = dict(tests=tests, null_summary={s: dict(mean=float(v.mean()), sd=float(v.std()), n=int(len(v)))
                                                  for s, v in nulls.items()})
    return out


def analogy_block(Eu, vocab, k2i, k=5):
    out = []
    for a, astar, b, expected in ANALOGIES:
        ia, ias, ib = k2i[a], k2i[astar], k2i[b]

        def top(q, exclude, n=k):
            sims = Eu @ (q / np.linalg.norm(q))
            order = np.argsort(-sims)
            res = []
            for i in order[: n + 5]:
                if int(i) in exclude:
                    continue
                res.append((vocab[int(i)], float(sims[i])))
                if len(res) == n:
                    break
            return res

        def rank_of(q, exclude, target):
            sims = Eu @ (q / np.linalg.norm(q))
            order = [int(i) for i in np.argsort(-sims) if int(i) not in exclude]
            return order.index(k2i[target]) + 1 if target in k2i else None

        q = Eu[ias] - Eu[ia] + Eu[ib]
        out.append(dict(query=f"{a} : {astar} :: {b} : ?", expected=expected,
                        vanilla=top(q, set()), vanilla_rank=rank_of(q, set(), expected),
                        add_excl=top(q, {ia, ias, ib}), add_excl_rank=rank_of(q, {ia, ias, ib}, expected),
                        only_b=top(Eu[ib], {ib}), only_b_rank=rank_of(Eu[ib], {ib}, expected),
                        ignore_a=top(Eu[ias] + Eu[ib], {ias, ib}), ignore_a_rank=rank_of(Eu[ias] + Eu[ib], {ias, ib}, expected)))
    return out


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------
BLUE, ORANGE, AQUA, INK, MUTED, BAND = "#2a78d6", "#eb6834", "#1baf7a", "#0b0b0b", "#52514e", "#c3c2b7"


def _scatter(ax, res, words, groups, colours, gen):
    S = np.asarray(res["scores"])
    for g, col in colours.items():
        idx = [i for i, w in enumerate(words) if groups[i] == g]
        ax.scatter(S[idx, 0], S[idx, 1], s=70, color=col, edgecolor="white", linewidth=1.5, label=g, zorder=3)
    for i, w in enumerate(words):
        ax.annotate(f"{w} ({gfmt(gen[i])})", (S[i, 0], S[i, 1]), xytext=(6, 4), textcoords="offset points",
                    fontsize=9, color=INK)
    ax.axhline(0, color=BAND, lw=0.8, zorder=1)
    ax.axvline(0, color=BAND, lw=0.8, zorder=1)
    ax.set_xlabel(f"PC1 ({100 * res['evr'][0]:.1f}% of variance)", color=INK)
    ax.set_ylabel(f"PC2 ({100 * res['evr'][1]:.1f}% of variance)", color=INK)
    ax.legend(frameon=False, fontsize=9)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    ax.spines["left"].set_color(BAND)
    ax.spines["bottom"].set_color(BAND)
    ax.tick_params(colors=MUTED)


def make_plots(out_dir, res8, res15, null8, labels_in_plot):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 10, "figure.facecolor": "white", "axes.facecolor": "white"})

    fig, ax = plt.subplots(figsize=(7.5, 6))
    _scatter(ax, res8, MALE8, ["lineal" if l else "collateral" for l in MALE8_LIN],
             {"lineal": BLUE, "collateral": ORANGE}, MALE8_GEN)
    ax.set_title("8 male kin terms: local PCA (unit vectors, mean-centred); labels show generation", color=INK)
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "pc_scatter_male8.png"), dpi=150)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8.5, 6.5))
    sexg = ["male" if s == 1 else "female" for s in MIXED15_SEX3]
    sexg[MIXED15.index("cousin")] = "unmarked"
    _scatter(ax, res15, MIXED15, sexg, {"male": BLUE, "female": ORANGE, "unmarked": AQUA}, MIXED15_GEN)
    ax.set_title("15 kin terms: local PCA (unit vectors, mean-centred); labels show generation", color=INK)
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "pc_scatter_mixed15.png"), dpi=150)
    plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.5), sharey=True)
    for ax, nm in zip(axes, ("unit", "raw")):
        kin = np.asarray(labels_in_plot[nm]["evr"])
        nul = np.asarray(null8[nm]["evr"])
        x = np.arange(1, len(kin) + 1)
        ax.fill_between(x, np.percentile(nul, 5, axis=0), np.percentile(nul, 95, axis=0), color=BAND, alpha=0.5,
                        label=f"random frequency-matched 8-word sets, 5th-95th pct (n={len(nul)})", lw=0)
        ax.plot(x, np.median(nul, axis=0), color=MUTED, lw=1.5, ls="--", label="random sets, median")
        ax.plot(x, kin, color=BLUE, lw=2, marker="o", ms=7, label="kinship set (8 male terms)")
        ax.axhline(1 / len(kin), color=MUTED, lw=1, ls=":", label=f"isotropic reference 1/{len(kin)}")
        ax.set_xticks(x)
        ax.set_xlabel("principal component", color=INK)
        ax.set_title(f"{nm} vectors, mean-centred", color=INK)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        ax.tick_params(colors=MUTED)
    axes[0].set_ylabel("explained-variance ratio", color=INK)
    axes[0].legend(frameon=False, fontsize=8, loc="upper right")
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "evr_spectrum_null.png"), dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Markdown tables
# ---------------------------------------------------------------------------
def md_table(headers, rows):
    esc = lambda c: str(c).replace("|", "\\|")
    lines = ["| " + " | ".join(esc(h) for h in headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(esc(c) for c in r) + " |" for r in rows]
    return "\n".join(lines)


def f3(x, nd=3):
    return f"{x:.{nd}f}"


def gfmt(g):
    return "0" if g == 0 else f"{g:+d}"


def pfmt(p):
    return f"{p:.4f}" if p >= 0.001 else f"{p:.1e}"


def fp(p, n=None):
    return pfmt(p) if n is None else f"{pfmt(p)} (n={n})"


def set_tables(title, words, res, label_names, gen, extra_cols=None):
    parts = [f"### {title}\n"]
    cfgs = ["unit/mean", "unit/medoid", "raw/mean", "raw/medoid"]
    parts.append("**Explained-variance ratios and eigengaps** (PC1..PC{}; lambda_k = s_k^2/(m-1))\n".format(len(words) - 1))
    rows = []
    for c in cfgs:
        r = res[c]
        rows.append([c] + [f3(v) for v in r["evr"]] + [f3(r["gap12"], 2), f3(r["gap23"], 2), f3(r["rel_gap"], 2)])
    parts.append(md_table(["config"] + [f"PC{k + 1}" for k in range(len(words) - 1)] + ["l1/l2", "l2/l3", "(l1-l2)/l1"], rows))
    parts.append("\n**Medoid centring**\n")
    rows = [[c, res[c]["medoid_word"], f3(res[c]["dist_mean_medoid"]), f3(res[c]["cos_pc1_mean_minus_medoid"])]
            for c in ("unit/medoid", "raw/medoid")]
    parts.append(md_table(["config", "medoid word", "||mu - c||", "|cos(PC1_medoid, mu - c)|"], rows))
    parts.append("\n**Correlation of the top 3 PCs with each label.** Signed Spearman rho (ordinal labels) or point-biserial r "
                 "(binary labels), sign convention: grandfather >= 0 on every PC. `p_k` = exact (or Monte-Carlo) "
                 "permutation p for |corr| of that single PC (unadjusted, exploratory); `p_max` = permutation p for "
                 "max over PC1..PC3 of |corr| (the pre-registered multiple-PC statistic). `N` = distinct labellings "
                 "enumerated (exact) or shuffles drawn (MC, +1 correction).\n")
    rows = []
    for c in cfgs:
        for ln in label_names:
            L = res[c]["labels"][ln]
            cells = [c, ln]
            for k in range(K_TOP):
                cells.append(f"{L['signed'][k]:+.3f} (p={pfmt(L['p_pc'][k])})")
            cells += [f"{L['max_obs']:.3f} on PC{L['argmax_pc']}", fp(L["p_max"]), f"{L['n_labellings']} {L['null_kind']}"]
            rows.append(cells)
        rows.append([c, "log freq. rank (rho)"] + [f"{v:+.3f}" for v in res[c]["rho_logrank"]] + ["", "", ""])
    parts.append(md_table(["config", "label", "PC1", "PC2", "PC3", "max|corr|", "p_max", "N"], rows))
    parts.append("\n**PC scores (words x PC1..PC3) per configuration**\n")
    for c in cfgs:
        S = np.asarray(res[c]["scores"])
        rows = [[w, gfmt(gen[i])] + [f"{S[i, k]:+.3f}" for k in range(K_TOP)] for i, w in enumerate(words)]
        parts.append(f"\n*{c}*\n\n" + md_table(["word", "gen", "PC1", "PC2", "PC3"], rows))
    parts.append("\n**Leave-one-out stability** (|cos| between the dropped-set eigenvector and the full-set one; "
                 "`plane` = cos of the largest principal angle between the PC1-PC2 planes; `swap` = dropped-set PC1 "
                 "is closer to the full-set PC2 than to the full-set PC1)\n")
    for c in cfgs:
        rows = []
        for r in res[c]["loo"]:
            rows.append([r["drop"], f3(r["cos_pc1"]), f3(r["cos_pc2"]), f3(r["plane_cos"]), "yes" if r["swap"] else "no",
                         r["medoid"] or "-"])
        parts.append(f"\n*{c}*\n\n" + md_table(["dropped word", "|cos PC1|", "|cos PC2|", "plane", "swap", "medoid of rest"], rows))
    return "\n".join(parts)


def null_tables(title, cmp, n_sets):
    parts = [f"### {title} (n = {n_sets} random frequency-matched sets, mean-centred)\n"]
    rows = []
    for nm in ("unit", "raw"):
        for stat, d in cmp[nm].items():
            rows.append([nm, stat, f3(d["obs"]), f3(d["null_median"]), f3(d["null_q95"]), f3(d["null_max"]),
                         f"{d['percentile']:.1f}", fp(d["p"])])
    parts.append(md_table(["vectors", "statistic", "kinship", "null median", "null 95th pct", "null max",
                           "kinship percentile", "p = (#null >= obs + 1)/(n + 1)"], rows))
    return "\n".join(parts)


def transfer_tables(tr):
    parts = ["### Supervised axes with held-out transfer\n",
             "Axis built on one sex, projected onto the other sex's words (never used in the construction). "
             "`corr` = Spearman (generation) or point-biserial (lineality) between projections and the held-out labels; "
             "`p_perm` = exact enumeration of held-out labellings (two-sided, |corr|); `p_dir` = fraction of 10,000 "
             "random unit directions in R^300 doing at least as well (+1 correction); `q95` = 95th percentile of the "
             "random-direction null.\n"]
    rows = []
    for r in tr["tests"]:
        rows.append([r["axis"], r["vectors"], r["test_set"], f"{r['corr']:+.3f}", fp(r["p_perm"], r["n_perm"]),
                     fp(r["p_dir"]), f3(r["null_dir_q95"])])
    parts.append(md_table(["axis (built on)", "vectors", "held-out set", "corr", "p_perm", "p_dir", "q95(null dir)"], rows))
    parts.append("\n**Projections of held-out words on the male-built axes (raw vectors)**\n")
    for r in tr["tests"]:
        if r["vectors"] == "raw" and (r["axis"].startswith("generation PC1 (male") or r["axis"].startswith("lineality (male")):
            rows = [[w, gfmt(l), f"{p:+.3f}"] for w, l, p in zip(r["test_words"], r["test_labels"], r["proj"])]
            parts.append(f"\n*{r['axis']} -> {r['test_set']}*\n\n" + md_table(["word", "label", "projection"], rows))
    parts.append("\n**Cross-sex agreement of the axes themselves** (cosine between the male-built and female-built axis; "
                 "isotropic reference sd for a random pair of unit vectors in R^300 is 1/sqrt(300) = 0.058)\n")
    rows = [[k, f3(v)] for k, v in tr["axis_cosines"].items()]
    parts.append(md_table(["axes", "cos"], rows))
    return "\n".join(parts)


def offset_tables(off):
    parts = ["### Offset collinearity\n",
             "`chain` nulls share the middle word, cos(a - b, c - a); `disjoint` nulls use four distinct random words, "
             "cos(a - b, c - d); random words drawn from the 50,000 most frequent alphabetic tokens.\n"]
    rows = []
    for nm in ("raw", "unit"):
        for t in off[nm]["tests"]:
            rows.append([nm, t["name"], t["shape"], f3(t["cos"]), f"{t['null_mean']:+.3f} +/- {t['null_sd']:.3f}",
                         f"[{t['null_q025']:+.3f}, {t['null_q975']:+.3f}]", f"{t['percentile']:.1f}", fp(t["p_right"])])
    parts.append(md_table(["vectors", "statistic", "null shape", "cos", "null mean +/- sd", "null 95% interval",
                           "percentile", "p (null >= obs)"], rows))
    return "\n".join(parts)


def analogy_tables(an):
    parts = ["### Linzen-style analogy sanity check (3CosAdd, unit vectors, cosine over the full vocabulary)\n",
             "`vanilla` = nearest neighbour of a* - a + b with no exclusion; `3CosAdd` = same with a, a*, b excluded; "
             "`ONLY-B` = nearest neighbour of b alone; `IGNORE-A` = nearest neighbour of a* + b (a*, b excluded). "
             "Rank = position of the expected answer in that list.\n"]
    rows = []
    for r in an:
        def fmt(lst):
            return ", ".join(f"{w} ({s:.2f})" for w, s in lst[:3])
        rows.append([r["query"], r["expected"], f"{fmt(r['vanilla'])} [rank {r['vanilla_rank']}]",
                     f"{fmt(r['add_excl'])} [rank {r['add_excl_rank']}]", f"{fmt(r['only_b'])} [rank {r['only_b_rank']}]",
                     f"{fmt(r['ignore_a'])} [rank {r['ignore_a_rank']}]"])
    parts.append(md_table(["query", "expected", "vanilla", "3CosAdd (excl.)", "ONLY-B", "IGNORE-A"], rows))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--vectors", help="path to a GloVe/word2vec text file (.txt or .gz; header optional)")
    src.add_argument("--gensim", help="gensim-data model name, e.g. glove-wiki-gigaword-300")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--limit", type=int, default=None, help="load only the first N (most frequent) words")
    ap.add_argument("--n-random-sets", type=int, default=200)
    ap.add_argument("--n-mc", type=int, default=20000, help="Monte-Carlo shuffles when exact enumeration is too large")
    ap.add_argument("--n-dirs", type=int, default=10000, help="random unit directions for the transfer null")
    ap.add_argument("--n-offset-null", type=int, default=10000)
    ap.add_argument("--max-exact", type=int, default=500000, help="enumerate all labellings exactly up to this many")
    ap.add_argument("--no-plots", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    t0 = time.time()
    timings = {}
    ss = np.random.SeedSequence(args.seed)
    rng_perm, rng_null8, rng_null15, rng_transfer, rng_offset = [np.random.default_rng(s) for s in ss.spawn(5)]

    kv, path = load_vectors(args)
    timings["load_s"] = time.time() - t0
    vocab = kv.index_to_key
    k2i = kv.key_to_index
    E = kv.vectors                       # (V, 300) float32, frequency-ordered
    V, d = E.shape
    missing = [w for w in ALL_KIN if w not in k2i]
    if missing:
        sys.exit(f"missing from vocabulary: {missing}")
    print(f"loaded {V} x {d} vectors from {path} in {timings['load_s']:.1f} s; first words: {vocab[:8]}")
    Eu = unit(E.astype(np.float32))
    ok = np.fromiter((w.isalpha() for w in vocab), dtype=bool, count=V)
    exclude = {k2i[w] for w in ALL_KIN}
    pool = np.array([i for i in range(min(V, 50000)) if ok[i] and i not in exclude])
    ranks = {w: k2i[w] + 1 for w in ALL_KIN}       # 1-based frequency rank

    def X_of(words):
        return E[[k2i[w] for w in words]].astype(np.float64)

    results = dict(meta=dict(vector_file=path, gensim_name=args.gensim, vocab_size=int(V), dim=int(d), seed=args.seed,
                             n_random_sets=args.n_random_sets, n_mc=args.n_mc, n_dirs=args.n_dirs,
                             n_offset_null=args.n_offset_null, max_exact=args.max_exact,
                             numpy=np.__version__, python=sys.version.split()[0], first_words=vocab[:10],
                             alphabetic_tokens=int(ok.sum()), pool_size=int(len(pool))),
                   ranks=ranks)

    # 1-2. Core unsupervised analysis + stability, 8 male terms
    t = time.time()
    labels8 = [dict(name="generation", values=MALE8_GEN, kind="ordinal"),
               dict(name="|generation|", values=MALE8_ABSGEN, kind="ordinal"),
               dict(name="lineal", values=MALE8_LIN, kind="binary")]
    X8 = X_of(MALE8)
    res8 = analyse_set(MALE8, X8, labels8, "grandfather", [ranks[w] for w in MALE8], rng_perm, args.n_mc, args.max_exact)
    results["male8"] = res8
    timings["male8_s"] = time.time() - t
    print(f"male8 done in {timings['male8_s']:.1f} s")

    # 3. Frequency-matched random-set null for the 8-word set
    t = time.time()
    null8 = random_set_null(E, [k2i[w] for w in MALE8], labels8, args.n_random_sets, rng_null8, ok, exclude)
    cmp8 = {}
    for nm in ("unit", "raw"):
        r = res8[f"{nm}/mean"]
        cmp8[nm] = {"EVR_1": compare_to_null(r["evr"][0], [e[0] for e in null8[nm]["evr"]])}
        for lb in labels8:
            cmp8[nm][f"max|corr| top-3 PCs vs {lb['name']}"] = compare_to_null(r["labels"][lb["name"]]["max_obs"],
                                                                               null8[nm]["best"][lb["name"]])
    results["null8"] = dict(comparison=cmp8,
                            evr_null={nm: dict(median=np.median(null8[nm]["evr"], 0).tolist(),
                                               q05=np.percentile(null8[nm]["evr"], 5, 0).tolist(),
                                               q95=np.percentile(null8[nm]["evr"], 95, 0).tolist()) for nm in null8},
                            example_sets=[[vocab[i] for i in s] for s in null8["unit"]["words"][:5]])
    timings["null8_s"] = time.time() - t
    print(f"null8 done in {timings['null8_s']:.1f} s")

    # 4. Mixed-sex 15-term set
    t = time.time()
    labels15 = [dict(name="sex (14 marked words)", values=MIXED15_SEX, kind="binary", mask=MIXED15_SEX_MASK),
                dict(name="sex3 (cousin=0)", values=MIXED15_SEX3, kind="ordinal"),
                dict(name="generation", values=MIXED15_GEN, kind="ordinal"),
                dict(name="|generation|", values=MIXED15_ABSGEN, kind="ordinal"),
                dict(name="lineal", values=MIXED15_LIN, kind="binary")]
    X15 = X_of(MIXED15)
    res15 = analyse_set(MIXED15, X15, labels15, "grandfather", [ranks[w] for w in MIXED15], rng_perm, args.n_mc, args.max_exact)
    for c, r in res15.items():   # does PC1 separate sex? (M vs F, cousin excluded)
        S = np.asarray(r["scores"])
        sM = S[[i for i in range(15) if MIXED15_SEX3[i] == 1], 0]
        sF = S[[i for i in range(15) if MIXED15_SEX3[i] == -1], 0]
        r["pc1_sex_separation"] = dict(frac_pairs_ordered=float(np.mean(sM[:, None] > sF[None, :])),
                                       perfectly_separated=bool(sM.min() > sF.max() or sF.min() > sM.max()))
    results["mixed15"] = res15
    null15 = random_set_null(E, [k2i[w] for w in MIXED15], labels15, args.n_random_sets, rng_null15, ok, exclude)
    cmp15 = {}
    for nm in ("unit", "raw"):
        r = res15[f"{nm}/mean"]
        cmp15[nm] = {"EVR_1": compare_to_null(r["evr"][0], [e[0] for e in null15[nm]["evr"]])}
        for lb in labels15:
            cmp15[nm][f"max|corr| top-3 PCs vs {lb['name']}"] = compare_to_null(r["labels"][lb["name"]]["max_obs"],
                                                                                null15[nm]["best"][lb["name"]])
    results["null15"] = dict(comparison=cmp15)
    timings["mixed15_s"] = time.time() - t
    print(f"mixed15 done in {timings['mixed15_s']:.1f} s")

    # 5. Supervised transfer
    t = time.time()
    tests, axes = [], {}
    for nm, M in (("raw", E), ("unit", Eu)):
        vec = lambda w, M=M: M[k2i[w]].astype(np.float64)
        Xf7, Xm7, Xf6 = (np.stack([vec(w) for w in ws]) for ws in (FEMALE7, MALE7, SKELETON_FEMALE6))
        Xm8 = np.stack([vec(w) for w in MALE8])
        for method in ("pc1", "mean"):
            axes[(nm, "gen", "male", method)] = a_m = build_gen_axis(vec, MALE_GEN_PAIRS, method)
            axes[(nm, "gen", "female", method)] = a_f = build_gen_axis(vec, FEMALE_GEN_PAIRS, method)
            lab = f"generation {method.upper() if method == 'pc1' else 'mean'} (male pairs)"
            tests.append(dict(axis=lab, vectors=nm, test_set="female 7", test_words=FEMALE7, test_labels=FEMALE7_GEN,
                              **transfer_test(a_m, Xf7, FEMALE7_GEN, "ordinal", rng_transfer, args.n_dirs, args.max_exact)))
            if method == "pc1":
                tests.append(dict(axis=lab, vectors=nm, test_set="female 6 (skeleton add-on C)", test_words=SKELETON_FEMALE6,
                                  test_labels=SKELETON_FEMALE6_GEN,
                                  **transfer_test(a_m, Xf6, SKELETON_FEMALE6_GEN, "ordinal", rng_transfer, args.n_dirs, args.max_exact)))
                tests.append(dict(axis=lab, vectors=nm, test_set="male 8 (TRAINING words, not a test)", test_words=MALE8,
                                  test_labels=MALE8_GEN,
                                  **transfer_test(a_m, Xm8, MALE8_GEN, "ordinal", rng_transfer, args.n_dirs, args.max_exact)))
            tests.append(dict(axis=lab.replace("male", "female"), vectors=nm, test_set="male 7", test_words=MALE7,
                              test_labels=MALE7_GEN,
                              **transfer_test(a_f, Xm7, MALE7_GEN, "ordinal", rng_transfer, args.n_dirs, args.max_exact)))
        axes[(nm, "lin", "male")] = l_m = build_lin_axis(vec, MALE_LINEAL, MALE_COLLATERAL)
        axes[(nm, "lin", "female")] = l_f = build_lin_axis(vec, FEMALE_LINEAL, FEMALE_COLLATERAL)
        tests.append(dict(axis="lineality (male lineal - male collateral)", vectors=nm, test_set="female 7", test_words=FEMALE7,
                          test_labels=FEMALE7_LIN,
                          **transfer_test(l_m, Xf7, FEMALE7_LIN, "binary", rng_transfer, args.n_dirs, args.max_exact)))
        tests.append(dict(axis="lineality (female lineal - female collateral)", vectors=nm, test_set="male 7", test_words=MALE7,
                          test_labels=MALE7_LIN,
                          **transfer_test(l_f, Xm7, MALE7_LIN, "binary", rng_transfer, args.n_dirs, args.max_exact)))
    axis_cos = {}
    for nm in ("raw", "unit"):
        for method in ("pc1", "mean"):
            axis_cos[f"{nm}: generation {method} male vs female"] = float(axes[(nm, "gen", "male", method)] @ axes[(nm, "gen", "female", method)])
        axis_cos[f"{nm}: lineality male vs female"] = float(axes[(nm, "lin", "male")] @ axes[(nm, "lin", "female")])
        axis_cos[f"{nm}: generation pc1 (male) vs lineality (male)"] = float(axes[(nm, "gen", "male", "pc1")] @ axes[(nm, "lin", "male")])
    results["transfer"] = dict(tests=tests, axis_cosines=axis_cos)
    timings["transfer_s"] = time.time() - t
    print(f"transfer done in {timings['transfer_s']:.1f} s")

    # 6. Offset collinearity
    t = time.time()
    results["offsets"] = offset_block(E, Eu, k2i, pool, rng_offset, args.n_offset_null)
    timings["offsets_s"] = time.time() - t

    # 7. Analogy sanity check
    t = time.time()
    results["analogies"] = analogy_block(Eu, vocab, k2i)
    timings["analogies_s"] = time.time() - t
    print(f"offsets+analogies done in {timings['offsets_s'] + timings['analogies_s']:.1f} s")

    # 8. Plots
    if not args.no_plots:
        t = time.time()
        make_plots(args.out, res8["unit/mean"], res15["unit/mean"], null8, {nm: res8[f"{nm}/mean"] for nm in ("unit", "raw")})
        timings["plots_s"] = time.time() - t

    timings["total_s"] = time.time() - t0
    results["meta"]["timings_s"] = {k: round(v, 2) for k, v in timings.items()}

    with open(os.path.join(args.out, "results.json"), "w") as fh:
        json.dump(results, fh, indent=1, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o))

    # Markdown tables
    md = ["## Run metadata\n",
          md_table(["item", "value"], [["vector file", path], ["vocabulary", f"{V} x {d}"],
                                       ["first vocabulary entries", " ".join(vocab[:8])],
                                       ["alphabetic tokens / null pool (top 50k alphabetic)", f"{int(ok.sum())} / {len(pool)}"],
                                       ["seed", args.seed], ["random sets", args.n_random_sets], ["MC shuffles", args.n_mc],
                                       ["random directions", args.n_dirs], ["offset null draws", args.n_offset_null],
                                       ["python / numpy", f"{sys.version.split()[0]} / {np.__version__}"],
                                       ["timings (s)", ", ".join(f"{k}={v}" for k, v in results['meta']['timings_s'].items())]]),
          "\n## Words, frequency ranks and pre-registered labels\n",
          md_table(["word", "freq. rank (1-based)", "sex", "generation", "|generation|", "lineal"],
                   [[w, ranks[w], {1: "M", -1: "F", 0: "unmarked"}[MIXED15_SEX3[i]], gfmt(MIXED15_GEN[i]),
                     MIXED15_ABSGEN[i], MIXED15_LIN[i]] for i, w in enumerate(MIXED15)]),
          "\n## 1-2. Eight male terms: local PCA, labels, stability\n",
          set_tables("Male 8-term set", MALE8, res8, [l["name"] for l in labels8], MALE8_GEN),
          "\n## 3. Frequency-matched random-set null (8 words)\n",
          null_tables("Kinship vs random sets, 8 words", cmp8, args.n_random_sets),
          "\nExample random sets (unit): " + "; ".join(", ".join(s) for s in results["null8"]["example_sets"]) + "\n",
          "\n## 4. Mixed-sex 15-term set\n",
          md_table(["config", "PC1 fraction of (male, female) pairs ordered male > female", "perfectly separated"],
                   [[c, f3(r["pc1_sex_separation"]["frac_pairs_ordered"]), "yes" if r["pc1_sex_separation"]["perfectly_separated"] else "no"]
                    for c, r in res15.items()]),
          "",
          set_tables("Mixed 15-term set", MIXED15, res15, [l["name"] for l in labels15], MIXED15_GEN),
          "",
          null_tables("Kinship vs random sets, 15 words", cmp15, args.n_random_sets),
          "\n## 5. Supervised transfer\n",
          transfer_tables(results["transfer"]),
          "\n## 6. Offset collinearity\n",
          offset_tables(results["offsets"]),
          "\n## 7. Analogy sanity check\n",
          analogy_tables(results["analogies"])]
    with open(os.path.join(args.out, "results_tables.md"), "w") as fh:
        fh.write("\n".join(md) + "\n")
    print(f"total {timings['total_s']:.1f} s; wrote results.json, results_tables.md" + ("" if args.no_plots else ", 3 PNGs"))


if __name__ == "__main__":
    main()
