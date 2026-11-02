# Testing "re-centre on a kinship cluster, run local PCA, read off meaning": an afternoon experiment plan and pitfall catalogue

Scope: cheap, rigorous tests of the idea that if you take a small cluster of related words (father, son, grandfather, grandson, brother, uncle, nephew, ...), centre on the cluster, and run PCA, the principal directions encode meanings such as *generation* or *lineal-vs-collateral*. Pretrained vectors only, laptop scale, Python or plain JS. The general literature on linear structure in embeddings is covered by another researcher and is only touched where a pitfall needs it.

Notation used throughout: m = number of words in the cluster, d = embedding dimension (300 for all the static sets below), X = the m x d matrix of the cluster's vectors.

---

## Key question 1: Which pretrained vectors to use, and how to get them

### Takeaway
Use gensim's downloader for the three static sets (GloVe 6B 300d = 376 MB, word2vec GoogleNews = 1.66 GB, fastText wiki-news subword = 958 MB), or download the raw text files directly if you work in Node. GPT-2's input-embedding matrix (via Hugging Face `get_input_embeddings()`) is a cheap second test bed, but it is a matrix of *token* vectors, not word vectors, and multi-token words need care.

### Cited Findings
- gensim-data model table (name / vectors / download size / dims / licence): `glove-wiki-gigaword-300` 400,000 vectors, 376 MB, 300d, PDDL (Open Data Commons), "GloVe vectors trained on Wikipedia 2014 and Gigaword 5 (6B tokens), lowercased"; `glove-wiki-gigaword-50/100/200` are 65 / 128 / 252 MB; `word2vec-google-news-300` 3,000,000 vectors, 1662 MB, 300d, licence listed as "not found", "trained on part of Google News (about 100 billion words), including multi-word phrases"; `fasttext-wiki-news-subwords-300` 999,999 vectors, 958 MB, 300d, CC BY-SA 3.0, "trained on Wikipedia 2017, the UMBC webbase corpus, and statmt.org news (16B tokens)"; `glove-twitter-25/50/100/200` 1,193,514 vectors, 104–758 MB. — [gensim-data README](https://github.com/piskvorky/gensim-data)
- Loading code and cache location: `import gensim.downloader as api; model = api.load("glove-twitter-25")`; "When you use the Gensim download API, all data is stored in your `~/gensim-data` home folder." The GloVe models in gensim-data are converted to word2vec format. — [gensim-data README](https://github.com/piskvorky/gensim-data)
- Stanford GloVe raw downloads: `glove.6B.zip` (Wikipedia 2014 + Gigaword 5, 6B tokens, 400K vocab, uncased, 50/100/200/300d, 822 MB zip); `glove.42B.300d.zip` (Common Crawl, 42B tokens, 1.9M vocab, uncased, 1.75 GB); `glove.840B.300d.zip` (Common Crawl, 840B tokens, 2.2M vocab, **cased**, 2.03 GB); `glove.twitter.27B.zip` (2B tweets, 27B tokens, 1.2M vocab, uncased, 25–200d, 1.42 GB). Mirrors: `https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip` and `https://nlp.stanford.edu/data/wordvecs/glove.6B.zip`. Code is Apache 2.0; the vectors are released under the Public Domain Dedication and License (PDDL). Citation: Pennington, Socher & Manning 2014. — [stanfordnlp/GloVe README](https://github.com/stanfordnlp/GloVe) (the nlp.stanford.edu project page itself refused the connection twice during this session)
- fastText English vectors (all 300d, `.vec` text): `wiki-news-300d-1M` (1M words; Wikipedia 2017 + UMBC webbase + statmt.org news, 16B tokens), `wiki-news-300d-1M-subword`, `crawl-300d-2M` (2M words, Common Crawl 600B tokens), `crawl-300d-2M-subword`. URLs of the form `https://dl.fbaipublicfiles.com/fasttext/vectors-english/crawl-300d-2M.vec.zip`. Format: "The first line gives the vocabulary size and vector dimension. Each following line has a word followed by its space-separated values. Words are sorted by descending frequency." Licence CC BY-SA 3.0. Citation: Mikolov, Grave, Bojanowski, Puhrsch & Joulin, LREC 2018 (arXiv:1712.09405). File sizes are not stated on the page. — [fastText English word vectors](https://fasttext.cc/docs/en/english-vectors.html)
- Hugging Face `transformers`: `PreTrainedModel.get_input_embeddings()` / `resize_token_embeddings(None)` "just returns a pointer to the input tokens `torch.nn.Embedding` module of the model"; return type `torch.nn.Embedding`, "Pointer to the input tokens Embeddings Module of the model." — [transformers docs, Models](https://huggingface.co/docs/transformers/main_classes/model)
- Bolukbasi et al. used "the publicly available word2vec embedding trained on Google News", 300d, starting "with the 50,000 most frequent words", keeping "only lower-case words and phrases consisting of fewer than 20 lower-case characters" (26,377 words left), each "normalized to unit length". — [Bolukbasi et al. 2016, Section 3 (ar5iv)](https://ar5iv.labs.arxiv.org/html/1607.06520)

### Inferences
- Memory budget (arithmetic, not a citation): 400,000 x 300 float32 = 480 MB RAM for GloVe 6B; 3,000,000 x 300 float32 = 3.6 GB for GoogleNews. On a laptop, load GoogleNews with gensim's `KeyedVectors.load_word2vec_format(path, binary=True, limit=200000)` (the `limit=` argument keeps only the first N, most frequent, entries) or just use GloVe 6B. For JS, stream the GloVe text file line by line and keep only the words you need, plus the first ~50k lines for the frequency-matched controls (see Key question 3).
- Case matters: GloVe 6B and fastText wiki-news (as shipped in gensim) are lowercased; GoogleNews and GloVe 840B are cased, so "Father", "father", "Son", "son" are different vectors. Decide the convention once and check `w in kv.key_to_index` for every word before running anything.
- The GPT-2 input-embedding matrix `wte` is a static lookup table (one row per BPE token), so the same PCA recipe applies unchanged. But GPT-2 tokenises on bytes with a leading-space marker, so "father" and " father" are different tokens, and rarer words (e.g. " granddaughter") may split into several tokens, in which case the word has no single row. Check `len(tok.encode(" grandfather")) == 1` for each word and drop any that split. Read dimensions from `model.config.n_embd` and `model.config.vocab_size` rather than assuming them.
- Pick GloVe 6B 300d as the primary set (smallest, lowercased, PDDL), word2vec GoogleNews as the "different algorithm, different corpus" replicate, and GPT-2 `wte` as the "different model family" replicate; agreement across all three is a much stronger finding than any single result (see Antoniak & Mimno under Key question 3 for why single-run results are fragile).

### Gaps
- Licence of the GoogleNews word2vec vectors: gensim-data lists it as "not found"; I did not locate an authoritative licence statement.
- Zip sizes for the fastText English vectors are not stated on the fastText page and were not verified elsewhere.
- GPT-2 vocabulary size / hidden size (commonly 50,257 tokens and 768d for the small model) were not verified from a fetched source in this session; verify from `model.config`.

---

## Key question 2: A concrete recipe (word set, centring on mean vs medoid, covariance / SVD, projection, scoring)

### Takeaway
The whole computation is an SVD of an m x 300 matrix and takes milliseconds; the design decisions that matter are (a) which words, (b) raw vs unit-normalised vectors, (c) centre = mean vs medoid (a rank-one change to the scatter matrix), and (d) scoring each PC against pre-registered labels with a permutation null rather than eyeballing a 2-D plot.

### Cited Findings
- Bolukbasi et al.'s recipe for a semantic direction: take the ten gender-definitional pairs (she-he, daughter-son, her-his, mother-father, woman-man, gal-guy, Mary-John, girl-boy, herself-himself, female-male), form "the ten gender pair difference vectors" (each normalised to a unit vector), compute their principal components; the top component "denoted by the unit vector g" is the gender direction; "there is a single direction that explains the majority of variance in these vectors" and "the first eigenvalue is significantly larger than the rest", in contrast with ten random unit vectors in 300d (averaged over 1,000 draws) whose eigenvalue decline is "much more gradual and uniform". — [Bolukbasi et al. 2016, Section 5.1 and Figure 6 (ar5iv)](https://ar5iv.labs.arxiv.org/html/1607.06520)
- Kozlowski, Taddy & Evans build cultural dimensions from "word differences (e.g. man - woman, rich - poor, black - white, liberal - conservative)" and validate them by projecting words onto the dimensions and comparing "to surveyed responses and labeled historical data"; they also include a stability test for the associations. — [Kozlowski, Taddy & Evans 2019, abstract (arXiv)](https://arxiv.org/abs/1803.09288)
- Grand et al.'s "semantic projection": each object feature is a line between endpoint words (e.g. "small" to "big", "safe" to "dangerous"); category words are projected onto the line, which is "intuitively analogous to placing objects 'on a mental scale' between two extremes", and the projections "recover human judgments across a range of object categories and properties". — [Grand, Blank, Pereira & Fedorenko, abstract (arXiv:1802.01241)](https://arxiv.org/abs/1802.01241). Search snippets of the preprint report a median correlation with human ratings of 0.47 (0.61 after adjusting for inter-rater reliability), r > 0.5 for 25 of 52 category-feature pairs, best fit names-by-gender (r = 0.94), worst cities-by-cost (r = -0.15), and a word2vec supplementary median of 0.26 — these are Pearson correlations and I could not open the full text to confirm them. — [arXiv PDF listing](https://arxiv.org/pdf/1802.01241); [published version, Nature Human Behaviour 6(7):975-987, 2022 (paywalled redirect)](https://www.nature.com/articles/s41562-022-01316-8)
- Mu & Viswanath (All-but-the-Top): word vectors "share a large common vector, with a norm up to half the average norm of a word vector"; after removing the mean, the vectors are still far from isotropic because much of the energy sits in a low-dimensional subspace; the post-processing removes the nonzero mean from every vector and projects away the top D dominating directions. — [arXiv:1702.01417](https://arxiv.org/abs/1702.01417v2); [ICLR 2018 poster page](https://iclr.cc/virtual/2018/poster/298)

### Inferences
**Step 0: choose the words and the labels *before* looking at any vectors** (pre-registration is the single cheapest safeguard against reading tea leaves). A single-sex set keeps sex out of the picture (Pitfall 5):

| word | generation (relative to ego) | lineal (1) / collateral (0) |
|---|---|---|
| grandfather | +2 | 1 |
| father | +1 | 1 |
| son | -1 | 1 |
| grandson | -2 | 1 |
| uncle | +1 | 0 |
| brother | 0 | 0 |
| nephew | -1 | 0 |
| cousin | 0 | 0 |

The female mirror set (grandmother, mother, daughter, granddaughter, aunt, sister, niece, cousin) is held out for the transfer test (Key question 3) and, if combined with the male set, gives a 15-word set with a sex label (+1/-1) as a third candidate meaning.

**Step 1: fetch vectors**, X (m x d). Optionally unit-normalise rows. What normalisation changes: the raw vectors differ in both direction and length; PCA on raw vectors mixes length variation (which in static embeddings is tied to frequency, see Pitfall 1 and Mu & Viswanath's common component) with direction variation. On unit vectors, PCA sees only angular structure, which is what cosine-based reasoning about meaning assumes. Run both; if a PC survives only on raw vectors, suspect frequency.

**Step 2: choose the centre.** Mean: c = (1/m) sum_i x_i. Medoid: the word x_j minimising sum_i ||x_i - x_j|| (use the same metric you use everywhere else: Euclidean on raw vectors, or Euclidean on unit vectors, which is monotone in cosine). The medoid is an actual word; the mean is not.

**Step 3: centre and decompose.** X_c = X - 1 c^T. SVD X_c = U S V^T. The rows of V^T are the principal directions in R^d; the PC scores (coordinates of each word on each PC) are U S; the eigenvalues of the covariance are s_k^2/(m-1); the explained-variance ratios are s_k^2 / sum s_k^2. Because X_c has m rows, at most min(m, d) singular values are non-zero, and if c is the mean the centred rows sum to zero, so the rank is at most m - 1 (this is the degrees-of-freedom problem of Key question 3).

**Mean vs medoid is a rank-one shift.** Write mu for the mean and c for any other centre. Then X - 1c^T = (X - 1mu^T) + 1(mu - c)^T, so the scatter matrix becomes
(X - 1c^T)^T (X - 1c^T) = S_mu + m (mu - c)(mu - c)^T,
i.e. the mean-centred scatter S_mu plus a positive-semidefinite rank-one term pointing along (mu - c), with weight m ||mu - c||^2. Consequences: (i) the principal directions are *not* a re-labelling of the mean-centred ones; a new direction, mean-minus-medoid, is injected with weight proportional to m and to the squared distance between mean and medoid; (ii) if the medoid is far from the mean, PC1 of the medoid-centred analysis will tend to be the mean-minus-medoid direction, i.e. "where the medoid word sits relative to the rest", which is a fact about one word, not about the cluster; (iii) the medoid's own centred row is the zero vector, so it contributes nothing to the scatter and the rank can now reach m - 1 from the other m - 1 words plus the shift term. A clean way to present both: report mean-centred PCs as the primary result and report cos(PC1_medoid, mu - c) to show how much of the medoid analysis is just that shift.

**Step 4: project and plot** PC1 vs PC2, with the explained-variance ratios printed in the axis labels (Pitfall 9).

**Step 5: score each PC against each label.** Generation is ordinal with ties: use Spearman's rho between the PC-k score vector and the generation labels. Lineal/collateral and sex are binary: point-biserial correlation (= Pearson r between the score vector and a 0/1 label), or equivalently a two-sample t statistic; a silhouette score of the two groups along PC-k is a less standard alternative. For every statistic, attach the permutation p-value and the random-set control of Key question 3; never report the correlation alone.

**Step 6: the alternative, supervised axis** (Bolukbasi / Kozlowski / Grand style). Build the "generation" direction from labelled *pairs* rather than from unsupervised PCA: differences such as father - son, grandfather - father, grandfather - grandson, uncle - nephew (each unit-normalised), then either their mean or the top PC of the difference matrix. Build "lineal-vs-collateral" as mean(lineal words) - mean(collateral words). Then test these directions on words that were not used to build them (the female set). This is the fairer test of "does a lineage direction exist in the space": unsupervised PCA asks "is lineage the *largest* source of variance among these eight words?", which can be false even when a perfectly good lineage direction exists (it may be PC3, or spread over several PCs); the supervised axis asks the actual question, and the held-out test is the only thing that stops it from being circular.

### Gaps
- Bolukbasi's exact percentage of variance explained by the top PC of the gender-pair differences appears only in their Figure 6 chart, not in the text; I could not read the figure.
- Grand et al.'s correlation numbers above come from search snippets of the preprint, not from the full text; treat them as approximate until checked against the paper or its PMC copy (PMC10349641).

---

## Key question 3: Statistical safeguards (degrees of freedom, permutation tests, random-set controls, bootstrap over words, cross-validation, multiple comparisons)

### Takeaway
With 8 words in 300 dimensions any labelling can be fit exactly by *some* direction, and a permutation test on a binary label of 8 words cannot get below p = 2/70 = 0.029 two-sided, so no 8-word binary result survives even a mild multiple-comparison correction; the honest designs are (a) the 15-word set with exact/Monte-Carlo permutation nulls, (b) random frequency-matched word-set controls for the explained-variance and best-correlation statistics, (c) leave-one-out stability of the eigenvectors, and above all (d) a supervised axis built on one half and tested on the held-out half.

### Cited Findings
- Linzen 2016 on why baselines matter in exactly this kind of evaluation: the offset method's "reliance on cosine similarity conflates offset consistency with largely irrelevant neighborhood structure", and the paper proposes "simple baselines that should be used to improve the utility of the method". — [Linzen 2016, abstract (arXiv:1606.07736)](https://arxiv.org/abs/1606.07736); [ACL Anthology W16-2503](https://aclanthology.org/W16-2503/)
- Linzen's baselines and numbers: without excluding the query words, the nearest neighbour of a* - a + b was b in 93% of cases and a* in 5% (never a); "the poor performance of Vanilla confirms that a, a* and b must be excluded from the pool of potential answers". Baselines: ONLY-B (nearest neighbour of b alone) reaches 0.70 on plurals; IGNORE-A (nearest to a* + b) beats ONLY-B in 10 of 14 categories; ADD (the usual 3CosAdd with exclusion) averages about 0.60 on the best space and ranges 0.13–0.90 across categories; REVERSE lowers accuracy in most categories (mean change -0.11; US cities 0.69 -> 0.17; common capitals 0.90 -> 0.53). Recommendation: report ONLY-B and possibly IGNORE-A alongside offset results, and compare per category because overall averages hide large category differences. — [Linzen 2016 full text (ar5iv)](https://ar5iv.labs.arxiv.org/html/1606.07736)
- Antoniak & Mimno: "nearest-neighbor distances are highly sensitive to small changes in the training corpus for a variety of algorithms"; the instability is worse for smaller corpora; they recommend averaging over multiple bootstrap samples rather than trusting a single embedding model (four algorithms, six datasets, perturbation by document shuffling and bootstrap resampling). — [Antoniak & Mimno 2018, TACL 6:107-119](https://aclanthology.org/Q18-1008/); [TACL page](https://transacl.org/index.php/tacl/article/view/1202)
- Phipson & Smyth: permutation p-values "published in the genomic literature are often computed incorrectly", are "understated by about 1/m, where m is the number of permutations", and permutation "should be viewed as generating an exact discrete null distribution"; they develop "a computation strategy ... for exact p-values when permutations are randomly drawn". — [Phipson & Smyth 2010, abstract (arXiv:1603.05766)](https://arxiv.org/abs/1603.05766)
- Bolukbasi's own control for "is the top PC special?": compare the eigenvalue spectrum of the ten difference vectors with that of ten random unit vectors in 300d averaged over 1,000 draws. — [Bolukbasi et al. 2016, Figure 6 (ar5iv)](https://ar5iv.labs.arxiv.org/html/1607.06520)
- Kozlowski et al. validate dimensions against human survey ratings and include a stability test. — [Kozlowski, Taddy & Evans 2019 (arXiv)](https://arxiv.org/abs/1803.09288)

### Inferences
**The degrees-of-freedom problem, stated precisely.** After mean-centring, the m rows of X_c sum to zero, so rank(X_c) <= m - 1 (and <= d, irrelevant here since d = 300 >> m). The non-trivial PC scores form an m x (m-1) matrix T = U S whose columns span the (m-1)-dimensional space of mean-zero vectors in R^m. Any centred label vector y (generation, lineal, sex, or a random labelling) lives in that same space, so there is always a unit direction w in R^d with X_c w = y exactly: *every* labelling of 8 words is perfectly encoded by some direction in the span of the 8 vectors. "A direction exists" is therefore vacuous; the only non-vacuous claims are (i) the labelling aligns with a *top* PC (a claim about variance ordering, tested unsupervised with permutation + random-set nulls), or (ii) a direction built from some words predicts the labels of *other* words (tested supervised with held-out words).

**Permutation test, done right.** The PCs are computed without labels, so the score vector t_k is fixed and the null is "labels are exchangeable". Shuffle the labels, recompute the statistic, compare. Two practical points. (1) Resolution: with 8 words and a 4/4 binary label there are only C(8,4) = 70 distinct labelings, so the smallest attainable two-sided p is 2/70 = 0.029; with the generation multiset {-2, -1, -1, 0, 0, +1, +1, +2} there are 8!/(1! 2! 2! 2! 1!) = 5,040 distinct labelings; with the 15-word set and a 7/8 sex split there are C(15,7) = 6,435, and the generation multiset over 15 words gives many more. For m <= 9 enumerate all distinct labelings (exact p = count/total, no +1 needed); for larger m draw M random shuffles and report p = (b + 1)/(M + 1), the Phipson & Smyth correction, never b/M. (2) Which statistic: use |rho| (two-sided) unless the sign was pre-registered, and, if you test "the best of PC1..PC3", make the permutation statistic *the maximum over the three PCs* so the search is inside the null (this is a max-statistic correction and handles the multiple-PC comparison automatically).

**Multiple comparisons.** The tempting design "3 PCs x 3 labels x 2 centrings x 2 normalisations = 36 tests" needs Bonferroni alpha = 0.05/36 = 0.0014, which the 8-word set cannot reach for any binary label (floor 0.029) and only barely for generation (floor 1/5,040 x 2). Either pre-register one primary test (e.g. "PC1 of the mean-centred, unit-normalised male set correlates with generation") and call everything else exploratory, or fold the search into a max-statistic permutation as above, or use Holm's step-down instead of Bonferroni.

**Random word-set controls (frequency-matched).** The explained-variance ratio of PC1 and the best |rho| over PCs are both inflated for tiny m regardless of meaning. Build the null empirically: draw 1,000 sets of m words from the vocabulary, apply the identical pipeline and the identical label vector (assigned to the random words in arbitrary order), and record (a) EVR of PC1, (b) max_k |rho(t_k, label)|. Report where the kinship set falls in that distribution. Frequency matching: GloVe and fastText files are ordered by descending frequency (fastText states this; GloVe's gensim `index_to_key` order likewise starts with the commonest words), so take each kinship word's rank r and draw its control from the rank band [r/2, 2r]. This matters because frequency is a dominant direction (Pitfall 1) and the kinship words are unevenly frequent: father/son are common, grandson/nephew rare, so |generation| is confounded with rarity.

**Bootstrap / leave-one-out over word choice.** Re-run PCA dropping each word in turn (and adding plausible extras: cousin, great-grandfather, stepfather, father-in-law, brother-in-law). Record |cos(PC1_drop-i, PC1_full)| and the same for PC2. If any single word's removal drops the cosine below ~0.9 or swaps PC1/PC2, the axes are properties of the word list, not of the space. Report the eigengap (lambda_1 - lambda_2)/lambda_1 as the summary: a small gap means the top two PCs are only defined up to rotation (Pitfall 7).

**Cross-validation / transfer.** Build the axis on the male words, test on the female words (and vice versa). Statistics: Spearman between projections of the held-out words and their generation labels; point-biserial for lineal/collateral. Null 1: permute the held-out labels. Null 2 (stronger, and answers "is this direction special?"): project the held-out words onto 10,000 random unit directions in R^d and compare. Because sex is itself a strong direction (Pitfall 5), a male-built axis that transfers to female words is evidence that the generation direction is roughly *parallel* across sexes, which is exactly the parallelogram claim people make about kinship terms, now tested on words the axis never saw.

**Offset-collinearity test (the right version of the "straight line" idea).** The cleanest unsupervised statistic for "generation is a direction" is the cosine between successive offsets along a chain: cos(father - son, grandfather - father), cos(mother - daughter, grandmother - mother), and across sexes cos(father - son, mother - daughter). Null: cosines of offsets between random pairs of vocabulary words (empirical), noting that for isotropic random directions in d = 300 the cosine would have standard deviation about 1/sqrt(d) = 0.058, but real embeddings are anisotropic, so the empirical null will be wider and shifted; use it, not the isotropic formula. Report the Linzen-style baselines alongside any analogy you quote: if "father - son + daughter" lands on "mother", also report whether "daughter" alone already has "mother" as its nearest neighbour (ONLY-B).

### Gaps
- No source was found that specifically addresses PCA on m << d samples *of word vectors*; the rank and permutation-resolution facts above are derivations (elementary linear algebra and counting), not citations.
- Phipson & Smyth's (b+1)/(M+1) formula is their recommendation in the body of the paper; the abstract fetched only states the ~1/m understatement. I did not open the full text.

---

## Key question 4: Catalogue of pitfalls, each with a source

### Takeaway
The ten pitfalls below are the standard ways a small-cluster PCA fools its author; the most dangerous for the kinship test are frequency (confounded with |generation|), sex (will be PC1 of any mixed-sex set and is literally one of Bolukbasi's definitional pairs), the mean-vs-medoid rank-one shift, and the rank-deficiency / degrees-of-freedom problem from Key question 3.

### Cited Findings
- **(1) Frequency is a dominant direction.** FRAGE: "the embeddings of high-frequency words and low-frequency words lie in different subregions of the embedding space", so semantically similar rare and common words can be far apart; the paper trains adversarially "to blur the boundary between the embeddings of high-frequency words and low-frequency words" (NeurIPS 2018). — [Gong, He, Tan, Qin, Wang & Liu 2018, arXiv:1809.06858](https://arxiv.org/abs/1809.06858v2); [NeurIPS poster page](https://neurips.cc/virtual/2018/poster/11150)
- **(2) Global mean / anisotropy.** Mu & Viswanath: word vectors "share a large common vector, with a norm up to half the average norm of a word vector"; after mean removal the vectors remain far from isotropic with energy concentrated in a few top directions; removing the mean and the top D directions ("counter-intuitive, since denoising typically removes the weakest directions") improves similarity, categorisation, analogy, STS and classification across languages and representation methods. — [Mu & Viswanath, ICLR 2018, arXiv:1702.01417](https://arxiv.org/abs/1702.01417v2)
- **(3) Hubness.** Radovanović et al. define k-occurrence as "the number of times a point appears among the k nearest neighbors of other points in a data set" and hubs as "points with very high k-occurrences"; the k-occurrence distribution becomes skewed as dimensionality increases, and hubness "is an inherent property of data distributions in high-dimensional vector space". — [Radovanović, Nanopoulos & Ivanović 2010, JMLR 11](https://jmlr.org/papers/v11/radovanovic10a.html). Dinu, Lazaridou & Baroni describe hubs in embedding spaces as "vectors that tend to be near a high proportion of items, pushing their correct labels down the neighbour list" and propose a correction that takes "the proximity distribution of potential neighbours across many mapped vectors into account". — [Dinu, Lazaridou & Baroni 2015, arXiv:1412.6568](https://arxiv.org/abs/1412.6568). Schnitzer et al.: hubs "tend to be among the k nearest neighbors of a large number of data items"; local and global distance scaling reduce them. — [Schnitzer, Flexer, Schedl & Widmer 2012, JMLR 13](https://jmlr.org/papers/v13/schnitzer12a.html)
- **(4) Polysemy.** Arora et al.: "multiple word senses reside in linear superposition within the word embedding", "simple sparse coding can recover vectors that approximately capture the senses", each attached to one of about 2,000 "discourse atoms"; this holds across several embedding methods. — [Arora, Li, Liang, Ma & Risteski 2018, TACL Q18-1034](https://aclanthology.org/Q18-1034/)
- **(5) Gender dominates kinship clusters.** Bolukbasi's ten gender-definitional pairs *include* daughter-son and mother-father; the top PC of these pair differences is "a single direction that explains the majority of variance". The GoogleNews embeddings "exhibit female/male gender stereotypes to a disturbing extent" and "gender bias is first shown to be captured by a direction in the word embedding". — [Bolukbasi et al. 2016 (arXiv abstract)](https://arxiv.org/abs/1607.06520); [full text (ar5iv)](https://ar5iv.labs.arxiv.org/html/1607.06520)
- **(6) Sensitivity to the word list / training run.** Antoniak & Mimno: nearest-neighbour distances are "highly sensitive to small changes in the training corpus"; use averages over bootstrap samples rather than a single model. — [Antoniak & Mimno 2018](https://aclanthology.org/Q18-1008/)
- **(10) 3CosAdd excludes the query words.** Vanilla offset returns b 93% of the time and a* 5%; query words "must be excluded"; ONLY-B and IGNORE-A baselines are competitive; report them. — [Linzen 2016 (ar5iv)](https://ar5iv.labs.arxiv.org/html/1606.07736)

### Inferences
- **(1) Frequency, applied to kinship.** Of the eight male terms, father/son/brother are common and grandson/nephew are rare, so rarity tracks |generation| (a V-shape) and tracks the collateral/lineal split unevenly. Test: compute each word's log frequency rank (its line number in the GloVe/fastText file) and report Spearman(PC_k, log rank) next to Spearman(PC_k, generation); if the frequency correlation is as large, the PC is not a generation axis. Also compare raw vs unit-normalised results (vector length is where much of the frequency signal lives, consistent with Mu & Viswanath's common component having half the average norm).
- **(2) Global mean.** Local centring subtracts the cluster mean, which already removes the global common vector *plus* the cluster's own offset; but the top global directions (Mu & Viswanath's D dominating directions) are still inside the cluster's scatter. Run the pipeline twice: once on the vectors as shipped and once after subtracting the global mean (over the top 50k words) and projecting out the top 2–3 global PCs; if a kinship PC disappears, it was a global direction wearing a kinship costume. Mu & Viswanath's rule of thumb for D is approximately d/100 (recalled from the paper; verify in the text).
- **(3) Why the medoid may be a hub.** In high dimensions, distances concentrate, so the total distance from each candidate to the other m - 1 cluster members differs by small margins, and the medoid choice is fragile (re-check after dropping any one word). Separately, the hubness literature's mechanism is that points lying close to the data mean tend to be close to everyone and so become hubs; a cluster's "centre-most" word is thus liable to be the most generic, frequent member (likely "father" or "son") for reasons that have nothing to do with kinship semantics. Diagnostic: compute k-occurrence N_k (k = 10) of each kinship word within a 50k-word subset (chunked matrix multiplication; a few minutes on a laptop) and compare with the subset's N_k distribution. (The "close to the data mean" statement is my reading of Radovanović et al.; see Gaps.)
- **(4) Polysemy, applied.** "son" (also "Son" in religious usage and as a surname), "uncle" ("Uncle Sam", "say uncle"), "cousin" (figurative "a cousin of"), "father" (priest; "father of the nation"), "brother" (monk; solidarity), "sister" (nun; nurse). By Arora et al.'s result each of these vectors is a weighted sum of sense vectors, so an offset like father - son mixes "male parent minus male child" with "priest minus religious Son"; the chains with the fewest extra senses (grandfather, grandson, nephew, niece) are the cleanest. In the lowercased GloVe 6B, "Father"/"father" and "Son"/"son" are merged, making this worse; the cased GoogleNews set keeps them apart.
- **(5) Sex.** If you combine male and female terms, PC1 will almost certainly be sex, and finding it is a rediscovery of Bolukbasi's g. Either keep to a single-sex set, or project g out of all vectors first (their "neutralise" step: x <- x - (x.g) g) and then look for generation and lineage in what remains.
- **(6) Rotation sensitivity to scaling and membership.** PCA is not invariant to rescaling coordinates (raw vs normalised vectors give different PCs) nor to adding or removing a point; with m = 8, one word is 12.5% of the data, so adding "cousin" or "mother" can realistically swap PC1 and PC2. The leave-one-out cosines from Key question 3 are the diagnostic; the pretrained sets are single training runs, so Antoniak & Mimno's bootstrap-over-corpus advice translates, for a pretrained-only budget, into "replicate across GloVe, word2vec, fastText and GPT-2 and only believe what survives".
- **(7) Eigenvector sign and rotation.** Eigenvectors are defined up to sign, so fix a convention (e.g. orient PC1 so that "grandfather" scores positive) before comparing runs or sets; when two eigenvalues are nearly equal, the two eigenvectors are only defined up to a rotation within their plane, so compare *subspaces* (principal angles, or the canonical correlation between the label vector and the span of PC1–PC2) rather than individual PCs, and always report the eigengap.
- **(8) "Points on a straight line into the origin are eigenvectors" is a category error.** Eigenvectors belong to a linear map (a square matrix), not to a point cloud. The nearest true statement is: if the *uncentred* vectors are collinear through the origin, the uncentred scatter matrix X^T X has rank one and its sole non-null eigenvector is that line's direction. But PCA uses the *centred* scatter, whose eigenvectors describe spread around the mean, not lines through the origin; a cluster lying on a line that does not pass through the origin has a PC1 along the line and no special relation to the origin at all. The correct test of the intuition "father, grandfather, great-grandfather lie along one direction" is collinearity of *offsets*: cos(grandfather - father, father - son) near 1 (and the parallelogram version across sexes), with the empirical random-pair null from Key question 3.
- **(9) 2-D projections hide variance.** With 7 non-zero eigenvalues from 8 words, PC1 + PC2 might explain 40–60% of the scatter, so distances in the plot are unreliable; for comparison, 8 random isotropic points in R^300 would give 7 nearly equal eigenvalues (about 14% each), so an EVR of 25% for PC1 is *not* automatically meaningful; put the EVRs on the axes and show the random-set distribution of EVR_1.
- **(10) Analogies.** Any kinship analogy you quote (father : son :: mother : daughter) must exclude the three query words and must be accompanied by the ONLY-B baseline (is "daughter" already the nearest neighbour of "mother"?), otherwise it is Linzen's 93%-returns-b artefact in disguise.

### Gaps
- The explicit statement in Radovanović et al. 2010 that hubs lie near the data-set mean could not be quoted: the JMLR abstract page fetched does not mention it and the PDF was not text-extractable in this session; the mechanism is presented above as my reading of the paper and should be verified against its "mechanism of hubness" section.
- A direct source for "static-embedding vector norm grows with corpus frequency" (often cited as Schakel & Wilson 2015, arXiv:1508.02297) was not fetched; the claim is used above only as motivation for running raw vs normalised.
- Mu & Viswanath's rule of thumb D ~ d/100 is recalled, not verified from the fetched abstract.

---

## Key question 5: Extensions if the basic test works

### Takeaway
The natural next steps are transfer across sex (male-built axis on female words), replication across GloVe / word2vec / fastText / GPT-2, and the same recipe on other small semantic fields; days of the week are a known case where the structure is *circular*, not linear, so expect PCA to show a ring in PC1–PC2 rather than an ordinal axis.

### Cited Findings
- Engels et al. (arXiv:2405.14860, current title "Not All Language Model Features Are One-Dimensionally Linear"): using sparse autoencoders they "automatically find multi-dimensional features in GPT-2 and Mistral 7B", including "circular features representing days of the week and months of the year", and show via interventions on Mistral 7B and Llama 3 8B that "these exact circles are used to solve computational problems involving modular arithmetic". — [arXiv:2405.14860](https://arxiv.org/abs/2405.14860)
- Grand et al. validate feature axes (size, danger, intelligence, gender, cost, ...) for many categories against human ratings with mixed success (best names-by-gender r = 0.94, worst cities-by-cost r = -0.15, per search snippets of the preprint). — [arXiv:1802.01241](https://arxiv.org/abs/1802.01241)
- Kozlowski et al. apply antonym-pair dimensions to 20th-century US gender/class analysis and a US–Britain comparison, validated against surveys. — [arXiv:1803.09288](https://arxiv.org/abs/1803.09288)

### Inferences
- **Transfer across sex.** Build generation and lineal/collateral directions on the male words; project mother, daughter, grandmother, granddaughter, aunt, niece, sister; report Spearman / point-biserial with permutation and random-direction nulls. Then reverse the roles. A direction that transfers both ways is the strongest cheap evidence that kinship terms share a common "generation" direction independent of sex.
- **Across models.** Repeat on GloVe 6B, GoogleNews word2vec, fastText crawl, and GPT-2 `wte`; align signs; report the cosine between the generation directions found in each model after mapping... which is *not* possible directly across different spaces, so instead compare the *score vectors* (the 8 numbers per model) by Spearman correlation across models. Agreement of score orderings across four independently trained spaces is the cross-model statistic.
- **Other fields.** Days of the week (expect a ring; check whether PC1–PC2 form a circle with Monday..Sunday in cyclic order, as the Engels result predicts for LLM features, and whether static embeddings show the same); months; number words one..ten (ordinal; also test log vs linear spacing); colour terms (hue is circular too); military ranks (private, corporal, sergeant, lieutenant, captain, major, colonel, general: a clean ordinal axis with a frequency confound similar to kinship). For each, pre-register the label and run the same safeguards.
- **Neutralise-then-look.** After projecting out sex and the top global directions (Pitfalls 2 and 5), re-run the unsupervised PCA; if generation now appears as PC1, the earlier failure was masking, not absence.

### Gaps
- No paper was found in this session that reports a specific "generation" or "lineal/collateral" axis for kinship terms in static embeddings; the extensions above are untested suggestions.
- Whether static embeddings (as opposed to LLM features) show a circular day-of-week structure was not verified.

---

## Key question 6: Runnable skeleton (Python numpy + gensim, with permutation test) and a plain-JS alternative

### Takeaway
The core test is about 40 lines of numpy; the exact-enumeration permutation test is three of them; the plain-Node version avoids any linear-algebra library by diagonalising the m x m Gram matrix instead of the 300 x 300 covariance (same non-zero spectrum).

### Cited Findings
- gensim loading: `api.load("<name>")` returns a model ready for use; data cached in `~/gensim-data`. — [gensim-data README](https://github.com/piskvorky/gensim-data)
- GloVe/fastText text formats: fastText `.vec` has a header line "vocab_size dim" then "word v1 ... vd" per line, words sorted by descending frequency. — [fastText English vectors](https://fasttext.cc/docs/en/english-vectors.html). GloVe downloads are "text files" (the README does not spell out the line layout). — [stanfordnlp/GloVe README](https://github.com/stanfordnlp/GloVe)
- Hugging Face: `model.get_input_embeddings()` returns the `torch.nn.Embedding` input module. — [transformers docs](https://huggingface.co/docs/transformers/main_classes/model)
- p-value convention for random permutations: add one to numerator and denominator. — [Phipson & Smyth 2010](https://arxiv.org/abs/1603.05766)

### Inferences
**Python core (~40 lines; numpy, scipy, gensim).** Run as `python3 kinship_pca.py`.

```python
import itertools, numpy as np
import gensim.downloader as api
from scipy.stats import spearmanr

kv = api.load("glove-wiki-gigaword-300")                      # 376 MB, cached in ~/gensim-data
words = ["grandfather","father","son","grandson","uncle","brother","nephew","cousin"]
gen   = np.array([ 2, 1,-1,-2, 1, 0,-1, 0])                    # generation relative to ego (pre-registered)
lin   = np.array([ 1, 1, 1, 1, 0, 0, 0, 0])                    # 1 = lineal, 0 = collateral
X = np.stack([kv[w] for w in words]).astype(np.float64)
X /= np.linalg.norm(X, axis=1, keepdims=True)                  # unit-normalise; comment out to test raw vectors

def pca(X, centre):
    U, s, Vt = np.linalg.svd(X - centre, full_matrices=False)  # rows of Vt = principal directions in R^300
    return U * s, Vt, s**2 / np.sum(s**2)                      # scores (m x r), directions, explained-variance ratio

def perm_p(x, lab, M=20000, rng=np.random.default_rng(0)):     # two-sided permutation p for |Spearman rho|
    r = abs(spearmanr(x, lab).correlation)
    if len(lab) <= 9:                                          # small m: enumerate every distinct labelling exactly
        null = np.array([abs(spearmanr(x, p).correlation) for p in set(itertools.permutations(lab))])
        return r, (null >= r).mean(), len(null)
    null = np.array([abs(spearmanr(x, rng.permutation(lab)).correlation) for _ in range(M)])
    return r, ((null >= r).sum() + 1) / (M + 1), M              # Phipson & Smyth (2010) +1 correction

D = np.linalg.norm(X[:, None, :] - X[None, :, :], axis=2)      # pairwise distances
j = int(np.argmin(D.sum(1))); print("medoid word:", words[j])
for name, c in [("mean", X.mean(0)), ("medoid", X[j])]:
    scores, Vt, evr = pca(X, c)
    print(f"\ncentre = {name:6s}  explained variance (PC1..PC4): {np.round(evr[:4], 3)}")
    if name == "medoid":
        print("  cos(PC1_medoid, mean - medoid) =", round(abs(Vt[0] @ (X.mean(0) - X[j]) / np.linalg.norm(X.mean(0) - X[j])), 3))
    for k in range(3):
        for lname, lab in [("generation", gen), ("lineal", lin)]:
            r, p, n = perm_p(scores[:, k], lab)
            print(f"  PC{k+1} vs {lname:10s} |rho| = {r:.2f}   exact p = {p:.3f}   (distinct labelings = {n})")
```

Add-on A, leave-one-out stability of PC1 (Pitfall 6/7):

```python
_, Vt_full, _ = pca(X, X.mean(0))
for i, w in enumerate(words):
    Xi = np.delete(X, i, 0); _, Vt_i, _ = pca(Xi, Xi.mean(0))
    print(f"drop {w:12s}  |cos(PC1, PC1_full)| = {abs(Vt_i[0] @ Vt_full[0]):.2f}")
```

Add-on B, frequency-matched random-set control for "best |rho| over PC1–3" and EVR_1 (Key question 3). gensim's `kv.index_to_key` is in file order, i.e. descending frequency for these sets:

```python
rng = np.random.default_rng(1); ranks = [kv.key_to_index[w] for w in words]
best, evr1 = [], []
for _ in range(1000):
    pick = [kv.index_to_key[rng.integers(max(1, r // 2), 2 * r + 2)] for r in ranks]   # same rank band as each kinship word
    R = np.stack([kv[w] for w in pick]).astype(float); R /= np.linalg.norm(R, axis=1, keepdims=True)
    sc, _, ev = pca(R, R.mean(0)); evr1.append(ev[0])
    best.append(max(abs(spearmanr(sc[:, k], gen).correlation) for k in range(3)))
print("random sets: 95th pct of max|rho| =", np.percentile(best, 95), "  95th pct of EVR1 =", np.percentile(evr1, 95))
```

Add-on C, supervised axis with held-out transfer (Bolukbasi-style PCA of unit differences, tested on the female set, with a random-direction null):

```python
male   = ["father","son","grandfather","grandson","uncle","nephew"]; female = ["mother","daughter","grandmother","granddaughter","aunt","niece"]
g = np.array([1,-1,2,-2,1,-1])
M = np.stack([kv[w] for w in male]).astype(float); F = np.stack([kv[w] for w in female]).astype(float)
diffs = np.stack([M[0]-M[1], M[2]-M[0], M[2]-M[3], M[4]-M[5]]); diffs /= np.linalg.norm(diffs, axis=1, keepdims=True)
axis = np.linalg.svd(diffs, full_matrices=False)[2][0]; axis *= np.sign(axis @ (M[0] - M[1]))   # orient: older > younger
obs = spearmanr(F @ axis, g).correlation
Rd = rng.standard_normal((10000, F.shape[1])); Rd /= np.linalg.norm(Rd, axis=1, keepdims=True)
null = np.abs([spearmanr(F @ d, g).correlation for d in Rd])
print(f"held-out female rho = {obs:+.2f};  P(|rho_random dir| >= |obs|) = {((null >= abs(obs)).sum() + 1) / (len(null) + 1):.4f}")
```

GPT-2 variant (replace the first block): `from transformers import AutoTokenizer, AutoModel; tok = AutoTokenizer.from_pretrained("gpt2"); m = AutoModel.from_pretrained("gpt2"); E = m.get_input_embeddings().weight.detach().numpy()`; for each word use `ids = tok.encode(" " + w)` and keep the word only if `len(ids) == 1`, then `X = E[[tok.encode(" "+w)[0] for w in words]]`. Everything else is unchanged.

**Plain Node version (no dependencies).** Two ideas make it small: stream the GloVe text file and keep only the needed lines (GloVe lines are `word v1 ... v300`, no header; skip the first line for fastText `.vec`), and use the Gram trick: for centred X_c (m x d), the m x m matrix G = X_c X_c^T has the same non-zero eigenvalues as the d x d covariance; if G u_k = lambda_k u_k with ||u_k|| = 1, then the PC-k *scores* of the m words are simply sqrt(lambda_k) u_k, and the direction in R^d is v_k = X_c^T u_k / sqrt(lambda_k). So you only ever diagonalise an 8 x 8 symmetric matrix, for which a 30-line Jacobi rotation routine suffices (or npm `ml-matrix`'s `EigenvalueDecomposition`; unverified in this session).

```js
// node kinship.js glove.6B.300d.txt
const fs = require("fs"), readline = require("readline");
const words = ["grandfather","father","son","grandson","uncle","brother","nephew","cousin"];
const gen = [2,1,-1,-2,1,0,-1,0], want = new Set(words), vec = {};
const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]) });
rl.on("line", line => { const i = line.indexOf(" "), w = line.slice(0, i);
  if (want.has(w)) vec[w] = line.slice(i + 1).trim().split(" ").map(Number); });
rl.on("close", () => {
  const X = words.map(w => vec[w].map((v, _, r) => v / Math.hypot(...r)));      // unit-normalise
  const m = X.length, d = X[0].length;
  const mean = Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[j], 0) / m);
  const Xc = X.map(r => r.map((v, j) => v - mean[j]));
  const G = Xc.map(a => Xc.map(b => a.reduce((s, v, j) => s + v * b[j], 0)));   // m x m Gram matrix
  const { values, vectors } = jacobiEigen(G);                                    // symmetric 8x8 -> your own Jacobi routine
  // scores on PC k: values[k]**0.5 * vectors[k];  explained variance: values[k] / sum(values)
  // then: Spearman(scores_k, gen) and an exact permutation test over the distinct arrangements of gen
});
```

Reading a 1 GB GloVe text file with `readline` takes on the order of a minute; Spearman and the exact permutation enumeration (5,040 distinct generation labelings for 8 words) are trivial loops. For the random-set control in JS, keep the first 50,000 lines in memory as `Float32Array`s (50,000 x 300 x 4 bytes = 60 MB).

### Gaps
- The Node snippet was not executed in this session (no GloVe file on disk); the Python core was also not executed, since no vectors were downloaded here. Both are written against documented APIs (`api.load`, `kv.key_to_index`, `kv.index_to_key`, `get_input_embeddings`) but should be smoke-tested before relying on the numbers.
- The npm package name `ml-matrix` and its `EigenvalueDecomposition` class are from memory, not verified.
