# Findings

What the harness found when pointed at its own fixture. Each entry states what
was measured, on what date, with what command — and what it does *not* establish.

Nothing here is a claim about any commercial product. The fixture is a fictional
exchange with a made-up FAQ corpus.

---

## #1 — A document in the corpus that retrieval can never reach

**2026-08-13** · `npx jest lib/knowledge`

`intentFilter` returns the first `topK` (=3) documents declared under an intent.
The `order` intent has four:

```
[0] order-pending    ← returned
[1] order-cancel     ← returned
[2] order-history    ← returned
[3] order-partial    ✗ unreachable
```

`order-partial` is the only document explaining FOK/IOC and partial fills. Ask
the agent "我的订单一直未成交是怎么回事" and it answers from the first three,
which never mention them.

This is the deployed default path: the vector branch requires `OPENAI_API_KEY`,
and the deployment does not set one.

**Why it went unnoticed for four months.** The golden test asserted against a
string built by concatenating *every* document for the intent plus every
cross-referenced one — a reimplementation of retrieval that had no `topK`. The
copy passed. Production never did the same thing.

> A test that reimplements the code under test agrees with the original about
> everything except the bug.

**Kept unfixed on purpose.** It is the harness's first regression case, asserted
in `rag-eval.test.ts › known retrieval gaps`. That test fails the day retrieval
is fixed, which is the intended alarm.

**Not established:** whether the vector path has the same gap. It has never been
run against a seeded database.

---

## #2 — The harness's own correctness metric was measuring something else

**2026-08-13** · `npm run eval`

The deterministic check scored `永续合约最高多少倍杠杆` at **0.00** while the
judge scored faithfulness **1.00**. That shape — faithful but wrong — is the
exact signal this project was built to catch, so it was worth confirming rather
than reporting.

The retrieved context contained `100x`. The agent answered:

> Acme 的永续合约最高支持 **100 倍杠杆**。

The answer is right. The expectation was the literal string `100x`. The metric
was reporting surface form and calling it correctness.

**Fix:** the construct was renamed to `fact_token_presence`, and expectations
now accept alternative surface forms. Renaming is the substantive part —
accepting synonyms narrows the gap but does not close it, because:

- a correct paraphrase using none of the expected strings still scores 0, and
- a fabrication containing all of them still scores 1 (asserted in
  `report.test.ts › but coverage still cannot see a fabrication`).

`buildReport` now emits `correctness_absent` whenever a run has proxies and no
correctness observation, so a page of 1.00s cannot be read as "the answers are
right".

**What this cost:** one wrong number, caught in the first end-to-end run. What
it would have cost unnoticed: every subsequent report calling token overlap
"accuracy".

**Not established:** what the agent's actual correctness is. Nothing in this
repo measures it yet.

---

## #3 — The default configuration grades itself

**2026-08-13** · `npm run eval` with only `DEEPSEEK_API_KEY` set

```
faithfulness         llm_judge      mean 0.985  (n=13)
fact_token_presence  deterministic  mean 1.000  (n=13)

verdict: not_comparable   confidence: low
[CRITICAL] self_graded: 13/26 observations graded by the family that produced them
[WARN]     correctness_absent: nothing here measured whether the answers are true
```

`deepseek-chat` wrote the answers and `deepseek-chat` graded them. Published
estimates put same-family self-preference at roughly 10–25%, and it survives
rubrics with programmatically verifiable ground truth — so **0.985 is not a
quality result and must not be quoted as one.**

**This number is retained, not discarded.** It is the control arm. When a
cross-family judge is run over the identical answers, the difference between the
two is the measurement this repo exists to produce.

**Blocked:** no second model-family key is configured. Until then the
self-preference magnitude *for this pipeline* is unmeasured, and the 10–25%
figure above is borrowed from the literature — not a result of this repo.

---

## #4 — The bug that would have manufactured a headline result

**2026-08-13** · probing two cross-family judges before using them

Both candidate judges are reasoning models, and both leak their chain of
thought into `message.content`. A verbatim Kimi reply to *"reply with only the
number 0.7"*:

```
 0 </think> 0.7
```

`parseFloat(" 0 </think> 0.7")` returns **0**.

The eval's original score reader was `parseFloat(...)` with `isNaN ? 0` as the
fallback. Had the experiment been run through it, every cross-family score
would have come back at or near zero, the self-family judge would have averaged
0.985, and the run would have produced this:

> Self-preference measured at ~98 points. Far above the published 10–25%.

A large, clean, entirely fabricated result — and one nobody would have
questioned, because it points the way the literature says it should.

MiniMax fails differently: at `max_tokens=30` the reply is
`'<think>The user says: "Reply with only the number 0.7"...'` — truncated
before any verdict, full of digits that are not scores.

**Fix:** `lib/assay/parse.ts` strips reasoning, reads the *last* number, and
**throws** when it cannot find one. Unreadable rows are dropped and counted as
`parse-fail`, never scored 0. Judges are compared only on rows all of them
could read, so the means are not taken over different subsets. Tests are
anchored to the verbatim strings above.

**The general form:** a default value in a parser is a fabrication mechanism.
It converts "the measurement failed" into "the measurement succeeded and the
answer is 0" — and if 0 happens to be the direction your hypothesis predicts,
the pipeline will confirm your hypothesis on demand.

---

## #5 — Self-preference: the easy experiment gave the expected answer, and it was wrong

**2026-08-13** · `npm run selfpref` · deepseek-chat, Kimi-K2.6, MiniMax-M2.7

### First attempt, discarded

One generator (deepseek-chat), graded by its own family and by two others on
the same frozen answers:

```
deepseek-chat  (self)   0.818
Kimi-K2.6               0.700
MiniMax-M2.7            0.582
                        self − cross = +0.177
```

+17.7 points, sitting neatly inside the 10–25% the literature reports. It was
discarded before being written down anywhere, because in that design "same
family" was perfectly collinear with two other explanations:

- the self judge was the only **non-reasoning** model in the set, and
- a judge that is simply **lenient toward all text** scores its own text high
  without preferring it at all.

A single-generator design cannot separate those from self-preference. The
result was the expected one, which is exactly why it needed to be thrown away
rather than published.

### The matrix

Every model writes, every model grades, and each cell is decomposed as
`leniency(judge) + quality(generator) + residual`:

```
judge \ generator      deepseek-chat       Kimi-K2.6    MiniMax-M2.7
deepseek-chat                 *0.990           0.990           0.900
Kimi-K2.6                      0.780          *0.530           0.860
MiniMax-M2.7                   0.870           0.965          *0.914

model              leniency   quality    expected   actual     self-pref
deepseek-chat      0.945      0.825      0.876      0.990      +0.114
Kimi-K2.6          0.820      0.978      0.903      0.530      -0.373
MiniMax-M2.7       0.917      0.880      0.903      0.914      +0.011

mean residual: -0.083          n = 10 of 13 (3 dropped: unreadable by ≥1 judge)
```

**① The pairwise number was inflated by about a third.** deepseek-chat's
residual is +0.114 against +0.177 pairwise. Roughly a third of the "self-
preference" in the first experiment was judge strictness wearing its clothes.

**② Kimi runs the other way, and harder.** Other judges rate Kimi's answers
0.978 — the highest quality score in the table. Kimi rates them 0.530. It is
the strictest judge in the set *and* strictest on itself. A −0.373 residual is
three times deepseek's effect in the opposite direction.

**③ On this sample, "judges favour themselves" is not a rule.** One of three
models shows it, one shows the reverse at greater magnitude, one is flat, and
the mean residual is **negative**. That contradicts the direction of the
literature cited in this repo's own README — which is reported here as-is, not
reconciled.

### Auditing the −0.373: it is mostly not a preference

The matrix was re-run against the frozen answers with per-cell scores written to
`fixtures/runs/selfpref-matrix.json`. **All nine cells reproduced exactly**, so
the residuals are not sampling noise at temperature 0.

Kimi's self-scores are bimodal — `[0, 0, 0, 0, 0.5, 0.8, 1, 1, 1, 1]` — not
uniformly lower. Reading the rows instead of the mean:

```
Kimi as judge          →DeepSeek   →Kimi(self)   →MiniMax
怎么提币，步骤是什么          1.00        0.00        1.00
KYC认证需要什么材料           0.00        0.00        1.00
如何充值USDT入金             0.80        0.00        0.60
永续合约最高多少倍杠杆          0.00        0.00        0.00
```

Two of the four zeros Kimi gives itself, it also gives to others. On the
leverage question it gives **every** generator 0.00 — that is a property of the
question, not of the author.

Inspecting that question directly: the context states 最高支持100x杠杆,
新手建议从低杠杆开始, and 设置止损订单. All three answers assert exactly
those things, plus one extrapolation — they render "低杠杆" as the concrete
"2-5 倍", a number the context does not contain.

**Same text, same construct, and the judges split 0.00 / 0.95 / 1.00.**

Neither pole is defensible. Scoring 0.00 treats one added numeric example as
total ungroundedness; scoring 1.00 does not see it at all. What this reveals is
not that one judge is stricter — it is that **the 0–1 faithfulness scale is
mostly fiction**. These judges are making a binary call about whether
extrapolation counts, and their thresholds are categorically different. A mean
of 0.985 computed over such calls is arithmetic performed on incommensurable
verdicts.

It also disposes of majority voting as a remedy here: 2–1 would rule the answer
faithful, and the dissenter is not wrong, it is answering a different question
about what "supported by the context" permits.

So the −0.373 decomposes into at least two things — a genuinely lower self-score
on 怎么提币 (where others gave 1.00), and a judging threshold that fires on
questions regardless of author. The additive model cannot separate them, and
this repo does not claim to have measured self-preference for Kimi.

### Testing whether the disagreement is in the models or in the prompt

If judges split because the rubric never said what to do with elaboration, then
saying it should collapse the split. One sentence was added to the judge system
prompt — *an answer may add a concrete example consistent with the context
(context says "low leverage", answer says "2-5x"); deduct only for claims that
contradict the context or introduce facts it does not cover* — and the identical
frozen answers were re-graded (`npm run selfpref -- --policy`).

```
                            baseline   +policy
judges in exact agreement      53%       83%
spread > 0.3                   33%       13%
spread > 0.6                   30%       13%

Kimi's leniency (score given to others)   0.820 → 0.995
deepseek self-preference                  +0.114 → +0.043
Kimi self-preference                      −0.373 → −0.219
```

The leverage question, where the three judges had returned 0.00 / 0.85–0.95 /
1.00, went to **1.00 / 1.00 / 1.00** — a complete disagreement erased by one
sentence.

**Most of what looked like judge personality was an undefined rubric.** Kimi was
not a strict model; it was a model resolving an ambiguity differently, and it
stopped once the ambiguity was removed. Roughly a third to a half of both
self-preference residuals went with it — meaning part of what the matrix
attributed to "preference" was also rubric ambiguity, not preference.

This is the case against judge ensembling as a fix. Averaging three judges under
an undefined rubric averages three different guesses about what the question is.
Defining the question removed more disagreement than any amount of voting could.

### But the residual disagreement moved somewhere worse

The 13% that survives is concentrated on one question — 如何充值USDT入金 —
where all three generators trigger it. The context says only "获取充值地址" and
"选择正确网络". deepseek's answer supplies a UI path (进入「资产」或「钱包」页面
点击「充值」) and names specific networks (TRC20、ERC20、BEP20). None of that is
in the context.

MiniMax scores it **0.00**. deepseek scores it 0.85, Kimi 0.90.

Here the strict judge appears to be right, and by my reading of the context —
not against any human label — the invented UI steps are exactly the failure
faithfulness exists to catch. The permissive judges missed a real hallucination.

And the new rule is why. "May add a concrete example consistent with the
context" does not distinguish one number from a fabricated procedure, so the
lenient reading now has cover. **The rubric bought agreement partly by
licensing a real miss.**

> Sharpening a rubric does not eliminate disagreement; it relocates it to the
> rubric's own boundary. Agreement went up. Whether correctness went up is a
> separate question this run cannot answer — which is what
> `correctness_absent` has been saying all along.

### What this does not establish

- **n = 10 questions, 3 models, one corpus, one judging prompt.** Far too small
  for a confidence interval, and it is not offered as one.
- **The additive model is untestable at 3×3.** It assumes leniency and quality
  do not interact. With three models there are no degrees of freedom left to
  check that, so a large residual may be an interaction rather than a
  preference.
- **No explanation is offered for Kimi's −0.373.** Several stories fit (a
  reasoning model recognising its own shortcuts; a strictness that scales with
  familiarity; plain interaction). Nothing here distinguishes them, and
  inventing one would be the same error as publishing the +0.177.
- **Confounds checked, not eliminated:** answer length medians were 290 / 332 /
  326 characters across the three generators, so verbosity bias is unlikely to
  drive the table. Reasoning-vs-non-reasoning is *not* controlled — it remains
  collinear with model identity in a 3-model design.

### What would move it

A fourth and fifth model, at least one non-reasoning, to break the collinearity
and give the additive model something to be tested against. Same corpus, same
prompt, same frozen-answer protocol.

---

## Open

| # | Question | Blocker |
|---|---|---|
| 1 | Self-preference magnitude on this pipeline | second model-family API key |
| 2 | Does the vector path share finding #1's gap? | seeded pgvector database |
| 3 | Actual correctness of the reference agent | human labels, or τ²-bench state diffs |
| 4 | Is the `grounded_falsehood` threshold pair (0.8 / 0.5) anywhere near right? | labelled cases; currently an uncalibrated guess |
| 5 | Is `faithfulness` binary in practice for every judge, or only these three? | more judges |
| 6 | ~~Does an explicit extrapolation policy collapse the split?~~ | **answered: yes, 53%→83% agreement — and it licensed a real miss** |
| 7 | Does the permissive rubric's licensed miss show up as lower correctness? | needs correctness labels (blocked on #3) |
| 8 | Is RLS actually on in the live database? | `migrations/20260813_enable_rls.sql` is written but **unapplied** — see below |

---

## #6 — Every table shipped without row level security

**2026-08-13** · `git grep -niE "rls\|policy" supabase/` → zero matches

`schema.sql` creates four tables and enables none of them for RLS. In Supabase
that means the `anon` key — which is `NEXT_PUBLIC_`, i.e. compiled into the
browser bundle — could read and write all of them, including the full
`messages` transcript store.

**Not verified against the live database.** An attempt to read `messages` with
the anon key was blocked by a local permission gate, correctly, and was not
retried. So this is a defect established in the schema, not an observed
exploit. The deployment has since been deleted, which removes the public
surface but not the database.

The fix is written and **not yet applied**:
`migrations/20260813_enable_rls.sql` turns RLS on everywhere, grants `anon`
read on `knowledge_chunks` only (the FAQ corpus, which the retrieval path
needs), and gives `sessions` / `messages` / `message_feedback` no policy at
all — under RLS, no policy means denied.

It cannot go further than that. The fixture has no authentication: the visitor
widget and the agent dashboard hold the *same* anon key, and the dashboard is
meant to see every session while a visitor should see only their own. No policy
separates those without an identity to key on. Rewriting the fixture's auth is
out of scope for a harness that never touches those tables.

Consequence, stated rather than hidden: applying it **breaks the fixture's live
chat**, because the widgets insert rows and subscribe to `postgres_changes`
directly with the anon key and Realtime enforces RLS.
`migrations/20260813_dev_open_rls.sql` restores that for local use and opens
with a warning explaining exactly what it gives away.
