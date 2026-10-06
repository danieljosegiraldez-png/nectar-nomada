---
name: nn-decision-interview
description: Stress-test a plan or design for the Nectar Nomada platform by interviewing Daniel one question at a time until every branch of the decision tree is settled, recommending an answer for each question and checking the repository before asking anything the code can answer. Use this skill whenever Daniel says "grill me", "go over my questions", "challenge this plan", "interview me", or brings a half-formed feature, process change or architecture idea, and before writing a spec or PRD, even if he does not say "interview".
---

# Decision interview (Nectar Nomada)

Goal: reach a shared understanding by walking the decision tree, resolving dependencies between decisions in order, so nothing gets built on a guess.

## How to run it
1. **Look before asking.** If the repository, `docs/`, ADRs (`docs/architecture/DECISIONS.md`) or `SESSION_STATE.md` can answer a question, read them and report what you found instead of asking. Start with `bash scripts/open-decisions.sh` for decisions that only Daniel can take.
2. **One question at a time.** Give your recommended answer and the reason, then wait. Questions that depend on earlier answers come after them.
3. **Name conflicts at once.** When two of his answers cannot both be true (a full v1 and a fixed deadline, fully automatic and a person approving every step), say both halves and ask which gives. Do not pick a compromise for him.
4. **Separate need from solution.** If he names a technology, ask what it must do for him and whether the technology is a hard constraint, with the reason.
5. **Do not invent numbers.** Thresholds, durations and capacities come from him or a cited source; otherwise they become open questions.
6. **Hurry mode.** If he is short on time, ask exactly three things: what is wrong and what he does today, the last real case step by step, and what must work first. Everything else becomes an open question.

## Output
When the tree is settled, summarize decisions in a table (decision, answer, reason, who decides), list open questions with whether each blocks the start, and propose where each decision is recorded (an ADR for a design decision; the lot or process doc for a domain rule). Do not edit `SESSION_STATE.md` unless this session holds the merge turn (see `CLAUDE.md`).

## Skip the interview when
The request is a clear, small, reversible change. Do it and mention the assumption.
