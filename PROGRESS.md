# FlakeHunt — Session Progress

This file tracks what has been built, decisions made, and what remains.
Read this at the start of every new session before touching any code.

---

## Current status

All 10 phases from the build plan are complete. The code is **built and tested locally** but **not yet committed or published**.

---

## What is built

### Source files (all in `src/`)

| File | Status | Notes |
|---|---|---|
| `index.js` | ✅ Done | Orchestrator. Has `isAllowedEvent()` guard — skips raw branch pushes. Resolves provider + API key. |
| `aiClient.js` | ✅ Done | Provider factory (Anthropic/Gemini/Groq/GitHub/rules-only). Uses native Node 20 `fetch` — no new deps. |
| `logFetcher.js` | ✅ Done | Downloads ZIP logs from GitHub API, decompresses with AdmZip |
| `logParser.js` | ✅ Done | Supports Selenium+TestNG, Playwright (3 formats), Cypress, Jest. See parser notes below. |
| `classifier.js` | ✅ Done | AI or rules-based. Accepts `client` param — `null` triggers rules-only fallback. |
| `fixGenerator.js` | ✅ Done | AI fix generation. Accepts `client` param — returns `null` when `client` is null (rules-only). |
| `prCommenter.js` | ✅ Done | Uses `workflow_run.pull_requests[]` (NOT `payload.pull_request` — see bug note below) |

### Other files

| File | Status | Notes |
|---|---|---|
| `action.yml` | ✅ Done | Node20, inputs: model-provider / api-key / github-token / confidence-threshold / anthropic-api-key (deprecated) |
| `prompts/classify.txt` | ✅ Done | 5-category classification prompt with JSON response format |
| `.github/workflows/flakehunt.yml` | ✅ Done | User-facing workflow. Has `if:` condition filtering out raw pushes |
| `test/run-parser.js` | ✅ Done | Local test script with 5 log samples (Playwright/Selenium/Jest/Cypress). Run: `node test/run-parser.js` |
| `test/flaky.spec.js` | ✅ Done | Intentional Playwright flaky patterns (3 categories) |
| `test/flaky-selenium.java` | ✅ Done | Intentional Selenium/TestNG flaky patterns (3 categories) |
| `dist/index.js` | ✅ Built | Last built after all src/ changes. Rebuild with `npm run build` if src/ changes |
| `README.md` | ✅ Done | Full user-facing documentation — provider-agnostic, all 5 providers, trigger logic, Rio note |

---

## Key decisions made this session

### 1. Provider-agnostic AI (major addition)
FlakeHunt now works without an Anthropic API key. Users choose any provider via `model-provider` input.

**Providers supported:**

| Provider | Cost | Models used | Key source |
|---|---|---|---|
| `anthropic` | ~$0.01/run | Haiku (classify) + Sonnet (fix) | console.anthropic.com |
| `gemini` | Free tier | Gemini 1.5 Flash (both) | aistudio.google.com |
| `groq` | Free tier | Llama 3.1 8B (classify) + Llama 70B (fix) | console.groq.com |
| `github` | Free | GPT-4o-mini (classify) + GPT-4o (fix) | Uses GITHUB_TOKEN — no extra key |
| `rules-only` | Always free | No AI — keyword regex only | Nothing needed |

Implementation: `src/aiClient.js` — factory function using native `fetch`. Returns unified `client(prompt, maxTokens, useCase)` function. `useCase` is `'classify'` or `'fix'` — each provider maps to different models per use case. `rules-only` returns `null`; both `classifier.js` and `fixGenerator.js` handle `null` client gracefully.

Backward compatibility: `anthropic-api-key` input kept as deprecated alias for `api-key`.

### 2. Trigger logic — no raw branch pushes
FlakeHunt does NOT fire on `git push` to a feature branch. Reason: if a branch has a PR open, the `pull_request` event fires on push anyway — running both would double AI cost for the same failure. A push with no PR has no comment target.

**Fires on:** `pull_request`, `schedule`, `workflow_dispatch`, push to default branch (merge)
**Skipped:** raw push to feature branch

Enforced in two places:
- `src/index.js` → `isAllowedEvent()` function (runtime guard)
- `.github/workflows/flakehunt.yml` → `if:` condition on the job (workflow-level guard)

### 3. PR Commenter — critical bug fixed
When FlakeHunt runs via `workflow_run`, `context.payload.pull_request` is **always undefined**. The PR info lives at `context.payload.workflow_run.pull_requests[]`.

Old (broken): `if (!context.payload.pull_request)`
Fixed: `const prs = context.payload.workflow_run?.pull_requests ?? []`

### 4. Scheduled / non-PR runs
When `prs.length === 0` (schedule, merge to main, manual dispatch):
→ Writes analysis to **Actions Run Summary** tab instead of PR comment.
This is intentional for QA-owned pipelines (Apple/Rio model) — QA sees it and fixes the test suite.

### 5. Selenium support
Real Apple Selenium/TestNG log was used to build and validate this.

Detection: `log.includes('RemoteWebDriver') || log.includes('org.openqa.selenium')`

Key parser detail: stack traces include framework interceptors (e.g. `ReportEnhancer`) before the actual test class. Fixed by requiring the matched frame file to end in `Tests?.java` — skips aspects/interceptors.

Frame regex: `/at (?:app\/\/)?(?!java\.|org\.testng\.|org\.openqa\.|sun\.|jdk\.)([\w$.]+)\.([\w$]+)\(([\w$]*Tests?\.java):(\d+)\)/`

### 6. Playwright parser — 3 formats supported
Real Apple Playwright logs revealed that the parser needed to handle three distinct output formats:

| Format | Signal | Example |
|---|---|---|
| × markers | `× test name` | Standard Playwright reporter output |
| Numbered | `1) Suite › test name` | Playwright numbered failure list |
| No-marker | Plain `Error:` + stack | From helper files (`analyticsValidator.ts`) |

Framework detection also improved: added `/.spec\.[tj]s:\d+:\d+/` as a third signal — Playwright includes column numbers in stack frames (Jest does not), catching logs that have neither `@playwright` nor ` › `.

### 7. Jest errorMessage fix
`errorMessage` was empty because the pattern required a colon after `expect(...)` but Jest writes `expect(received).toHaveText(expected)` without one. Fixed with `extractJestError()` which captures the multi-line assertion block:
```
expect(received).method()
· Expected: "x"
· Received: null
```

`lineNumber` was also wrong — `test|spec` group capture made index off by one. Fixed by making the group non-capturing: `/(\w+\.(?:test|spec)\.[tj]s):(\d+)/`

### 8. Rio log limitation (identified, not fixable)
Rio CI shows only pipeline orchestration output in the top-level build log — not raw test failures. Actual Playwright failures are in `playwright-report/`. FlakeHunt cannot parse the top-level Rio log; it needs raw Playwright stdout or the results JSON. Documented in README.

### 9. Dependencies pinned
`@actions/core@1.10.1` and `@actions/github@6.0.0` — NOT v3/v9.
Reason: v3/v9 use ESM `exports` fields that ncc 0.38 cannot bundle. Downgraded to stable v1/v6.

---

## What remains before publishing

### Immediate (do first)
- [ ] **Commit everything to git** — `src/`, `dist/`, `package.json`, `.github/`, `test/`, `README.md`, `PROGRESS.md`
- [ ] Replace `yourusername` in `.github/workflows/flakehunt.yml` with actual GitHub username
- [ ] Update `author: 'Your Name'` in `action.yml`
- [ ] **End-to-end test** — trigger a real CI failure and verify the PR comment appears correctly
- [ ] Test each provider with a real API key (at minimum: `gemini` and `github` since they're free)

### Publishing to GitHub Marketplace
- [ ] Releases → Draft new release → tag `v1.0.0`
- [ ] Check "Publish this Action to the GitHub Marketplace"
- [ ] Add a screenshot of the PR comment to README (after end-to-end test)
- [ ] Verify `action.yml` branding section is complete

---

## How to test locally

```bash
# Test the parser against bundled CI log samples
node test/run-parser.js

# Rebuild dist after any src/ change
npm run build

# Test with a real API key
GEMINI_API_KEY=your-key node test/run-parser.js
```

---

## Known gaps (future improvements)

- **Jest errorMessage** — multi-line assertion block captured but `Expected`/`Received` values trimmed if they span more than 3 lines
- **Frameworks not yet supported** — JUnit, PyTest, RSpec, XCTest (Swift)
- **Truncated logs** — GitHub caps logs at ~1MB; very large test suites may have early failures cut off
- **Custom reporters** — teams using custom Playwright/Jest reporters with non-standard output formats won't be parsed correctly
- **Rio support** — top-level Rio logs are pipeline orchestration only; need raw `playwright-report/` output or results JSON
