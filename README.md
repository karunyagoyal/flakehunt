# FlakeHunt ⚡

Flaky test root-cause analyser for GitHub Actions. Automatically detects why your tests are flaky and suggests a specific code fix — posted directly on your PR. Works with any AI provider or fully rule-based (no API key needed).

---

## How it works

```
CI fails (PR / schedule / merge / manual)
    ↓
FlakeHunt triggers via workflow_run
    ↓
logFetcher.js   → downloads failed job logs from GitHub API (ZIP → text)
logParser.js    → regex-extracts failures (Selenium / Playwright / Cypress / Jest)
classifier.js   → AI or rules-based → root cause category + confidence
fixGenerator.js → AI generates a code fix (skipped for rules-only)
prCommenter.js  → posts / updates PR comment  (or Actions Summary for non-PR runs)
```

### Root cause categories

| Category | Signals |
|---|---|
| `SELECTOR_FRAGILITY` | StaleElementReferenceException, CSS class selector, XPath failing, strict mode violation, element detached from DOM |
| `ASYNC_TIMING` | TimeoutError, waitFor exceeded, Thread.sleep, page.goto timeout, race condition |
| `DATA_DEPENDENCY` | expected value missing, test user not found, stale fixture, seed data absent |
| `ENVIRONMENT_POLLUTION` | state from previous test, shared global variable, test order dependency |
| `NETWORK_INSTABILITY` | ECONNREFUSED, 503/504, external API timeout, ERR_CONNECTION_REFUSED |

### Supported test frameworks

| Framework | Language | Detection signals |
|---|---|---|
| Selenium + TestNG | Java | `RemoteWebDriver`, `org.openqa.selenium`, `Caused by:` |
| Playwright | JS/TS | `@playwright`, ` › ` separator, `spec.ts:line:col` format, `1) 2) 3)` numbered failures |
| Cypress | JS/TS | `Cypress`, `✗` marker |
| Jest | JS/TS | fallback — multi-line assertion block captured |

---

## Trigger logic

FlakeHunt fires on:
- ✅ Pull Request opened / updated
- ✅ Scheduled (nightly) runs
- ✅ Merge to default branch
- ✅ Manual `workflow_dispatch`
- ❌ Raw branch pushes — skipped intentionally. A push to a branch with an open PR already fires the `pull_request` event, so running on both would double the AI cost for the same failure.

---

## AI providers

FlakeHunt is provider-agnostic. Choose the option that fits your team:

| Provider | Cost | Fix generation | How to get key |
|---|---|---|---|
| `anthropic` | ~$0.01/run | ✅ Yes | console.anthropic.com |
| `gemini` | Free tier | ✅ Yes | aistudio.google.com |
| `groq` | Free tier | ✅ Yes | console.groq.com |
| `github` | Free (GitHub account) | ✅ Yes | Uses your GITHUB_TOKEN — no extra key |
| `rules-only` | Always free | ❌ No fix, category only | Nothing needed |

---

## Usage

### 1. Add your API key as a GitHub Secret (skip for `github` or `rules-only`)

**Settings → Secrets → Actions → New repository secret**

```
Name:  GEMINI_API_KEY        (or GROQ_API_KEY / ANTHROPIC_API_KEY)
Value: your-key-here
```

### 2. Copy the workflow file into your repo

```yaml
# .github/workflows/flakehunt.yml
name: FlakeHunt Analysis

on:
  workflow_run:
    workflows: ["CI"]   # ← change to your test workflow name
    types: [completed]

permissions:
  actions: read
  pull-requests: write
  contents: read

jobs:
  analyse:
    if: |
      github.event.workflow_run.conclusion == 'failure' &&
      (
        github.event.workflow_run.event == 'pull_request'      ||
        github.event.workflow_run.event == 'schedule'          ||
        github.event.workflow_run.event == 'workflow_dispatch' ||
        (
          github.event.workflow_run.event == 'push' &&
          github.event.workflow_run.head_branch == github.event.repository.default_branch
        )
      )
    runs-on: ubuntu-latest
    steps:
      - name: Analyse flaky tests
        uses: yourusername/flakehunt@v1
        with:
          model-provider: 'gemini'                        # or anthropic / groq / github / rules-only
          api-key:        ${{ secrets.GEMINI_API_KEY }}   # omit for github or rules-only
          github-token:   ${{ secrets.GITHUB_TOKEN }}
```

### 3. That's it

FlakeHunt posts a comment on the failing PR automatically:

```
## 🔍 FlakeHunt Analysis

1 flaky test(s) found

### 🎯 AirPodsMaxCurrentRegularStep1Tests.verifyAirpodsMaxCurrentRegularModelStep1

Root cause: Selector Fragility · Confidence: 92%

> CSS class selector failed after DOM re-render — stale element reference

💊 Suggested fix
  ### What is wrong
  Element reference captured before React re-render invalidates it.

  ### Fix
  - WebElement title = driver.findElement(By.tagName("h1"));
  + WebElement title = wait.until(ExpectedConditions.visibilityOfElementLocated(By.tagName("h1")));

  ### Why this works
  Explicit wait re-fetches the element after the DOM settles.
```

---

## CI/CD compatibility

FlakeHunt is a GitHub Action — it runs on GitHub's infrastructure.

**GitHub Actions as CI** — works natively, no changes needed.

**Jenkins / CircleCI / Rio / Azure DevOps / GitLab CI** — add a thin 5-line GitHub Actions wrapper that calls your existing pipeline. Your actual pipeline is untouched.

```yaml
# .github/workflows/ci.yml  (wrapper — 5 lines)
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run Jenkins / CircleCI / Rio
        run: curl -X POST ${{ secrets.CI_WEBHOOK }}
```

**QA-owned test suites (e.g. Apple/Rio model)** — when the QA pipeline runs separately with no PR association (e.g. nightly), FlakeHunt writes its analysis to the Actions Run Summary tab. QA sees and acts on it directly — appropriate since locator/fixture fixes are QA's responsibility, not the developer's.

**Rio-specific note** — Rio build logs show only pipeline orchestration output, not raw test failures. The actual Playwright failures live in `playwright-report/`. FlakeHunt needs access to the raw Playwright stdout or the results JSON, not the top-level Rio log.

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `model-provider` | ❌ | `anthropic` | AI provider: `anthropic` / `gemini` / `groq` / `github` / `rules-only` |
| `api-key` | ❌ | — | API key for chosen provider. Not needed for `github` or `rules-only` |
| `github-token` | ✅ | `github.token` | GitHub token for logs + PR comments. Used as API key when provider is `github` |
| `confidence-threshold` | ❌ | `70` | Min confidence (0–100) to post a fix — skips fix generation below this |
| `anthropic-api-key` | ❌ | — | Deprecated. Use `api-key` instead. Kept for backward compatibility |

## Outputs

| Output | Description |
|---|---|
| `root-cause` | Classified root cause category (e.g. `SELECTOR_FRAGILITY`) |
| `confidence` | AI confidence score (0–100) |

---

## Development

```bash
# Install dependencies
npm install

# Build dist/index.js (required — GitHub Actions runs this directly)
npm run build

# Test the log parser locally against any CI log
node test/run-parser.js
```

### Project structure

```
flakehunt/
├── action.yml                        ← GitHub Action metadata + inputs/outputs
├── package.json
├── src/
│   ├── index.js                      ← Orchestrator — resolves provider, wires all modules
│   ├── aiClient.js                   ← Provider factory (Anthropic/Gemini/Groq/GitHub/rules-only)
│   ├── logFetcher.js                 ← GitHub API → raw log text (ZIP → plain text)
│   ├── logParser.js                  ← Regex parser (Selenium/Playwright/Cypress/Jest)
│   ├── classifier.js                 ← AI or rules-based → root cause JSON
│   ├── fixGenerator.js               ← AI → code fix diff (null for rules-only)
│   └── prCommenter.js                ← Post/update PR comment or Actions Summary
├── prompts/
│   └── classify.txt                  ← Classification prompt template
├── test/
│   ├── run-parser.js                 ← Local parser test — run with any CI log
│   ├── flaky.spec.js                 ← Intentional Playwright/Jest flaky patterns
│   └── flaky-selenium.java           ← Intentional Selenium/TestNG flaky patterns
├── .github/
│   └── workflows/
│       └── flakehunt.yml             ← User-facing workflow file (copy into your repo)
└── dist/
    └── index.js                      ← Bundled output (committed — Actions runs this)
```

---

## License

MIT
