const core   = require('@actions/core');
const github = require('@actions/github');
const { createClient }     = require('./aiClient');
const { fetchFailedLogs }  = require('./logFetcher');
const { parseFailures }    = require('./logParser');
const { classifyFailure }  = require('./classifier');
const { generateFix }      = require('./fixGenerator');
const { postComment }      = require('./prCommenter');

// Valid trigger events for FlakeHunt.
// Raw branch pushes are excluded: if a branch has a PR open, the pull_request
// event already fires on push — running both would double-charge AI credits
// for the same failure. A push with no PR also has no comment target.
const ALLOWED_EVENTS = new Set(['pull_request', 'schedule', 'workflow_dispatch']);

function isAllowedEvent() {
  const triggeringEvent = github.context.payload?.workflow_run?.event;
  const branch          = github.context.payload?.workflow_run?.head_branch;
  const defaultBranch   = github.context.payload?.repository?.default_branch || 'main';

  if (ALLOWED_EVENTS.has(triggeringEvent)) return true;
  if (triggeringEvent === 'push' && branch === defaultBranch) return true;
  return false;
}

async function run() {
  try {
    if (!isAllowedEvent()) {
      const branch = github.context.payload?.workflow_run?.head_branch;
      core.info(
        'FlakeHunt skipped: triggered by a raw push to branch "' + branch + '".' +
        ' Open a PR for FlakeHunt to analyse this failure.'
      );
      return;
    }

    // ── Resolve provider + API key ─────────────────────────────────────────
    const provider = core.getInput('model-provider') || 'anthropic';

    // For GitHub Models the api-key IS the github-token — no extra key needed
    const apiKey = provider === 'github'
      ? core.getInput('github-token')
      : (core.getInput('api-key') || core.getInput('anthropic-api-key'));

    if (provider !== 'rules-only' && !apiKey) {
      core.warning('FlakeHunt: no api-key provided for provider "' + provider + '". Falling back to rules-only.');
    }

    const client = createClient(
      (!apiKey && provider !== 'rules-only') ? 'rules-only' : provider,
      apiKey
    );

    core.info('FlakeHunt: using provider "' + provider + '"' +
      (client ? '' : ' (rules-only — no AI fix generation)'));

    // ── Fetch + parse logs ─────────────────────────────────────────────────
    const logs = await fetchFailedLogs();
    if (!logs) { core.info('No failures — done'); return; }

    let failures = [];
    for (const { log } of logs) {
      failures = failures.concat(parseFailures(log));
    }
    if (!failures.length) { core.info('No test failures found'); return; }

    core.info('Found ' + failures.length + ' failure(s)');

    const threshold = parseInt(core.getInput('confidence-threshold'));

    // ── Classify all failures in parallel ──────────────────────────────────
    const classified = await Promise.all(
      failures.map(f => classifyFailure(f, client))
    );

    // ── Generate fixes for confident results ───────────────────────────────
    const withFixes = await Promise.all(
      classified.map(async f => {
        if (f.confidence >= threshold) {
          return { ...f, fix: await generateFix(f, client) };
        }
        return { ...f, fix: null };
      })
    );

    await postComment(withFixes);

    if (withFixes[0]?.category) {
      core.setOutput('root-cause', withFixes[0].category);
      core.setOutput('confidence', String(withFixes[0].confidence));
    }

  } catch (err) {
    core.warning('FlakeHunt error: ' + err.message);
  }
}

run();
