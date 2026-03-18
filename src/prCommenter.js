const core   = require('@actions/core');
const github = require('@actions/github');

const META = {
  SELECTOR_FRAGILITY:    { emoji: '🎯', label: 'Selector Fragility'    },
  ASYNC_TIMING:          { emoji: '⏱️',  label: 'Async Timing'          },
  DATA_DEPENDENCY:       { emoji: '🗃️',  label: 'Data Dependency'       },
  ENVIRONMENT_POLLUTION: { emoji: '🌊', label: 'Environment Pollution' },
  NETWORK_INSTABILITY:   { emoji: '🌐', label: 'Network Instability'   },
};

function buildComment(results) {
  const found = results.filter(r => r.category);
  let md = '## 🔍 FlakeHunt Analysis\n\n';
  md += found.length + ' flaky test(s) found\n\n---\n\n';

  for (const r of found) {
    const m = META[r.category];
    md += '### ' + m.emoji + ' ' + r.testName + '\n\n';
    md += '**Root cause:** ' + m.label + ' · ';
    md += '**Confidence:** ' + r.confidence + '%\n\n';
    md += '> ' + r.reasoning + '\n\n';

    if (r.fix) {
      md += '<details>\n<summary>💊 Suggested fix</summary>\n\n';
      md += r.fix + '\n\n</details>\n\n';
    }
    md += '---\n\n';
  }

  md += '<sub>Powered by FlakeHunt</sub>';
  return md;
}

async function postComment(results) {
  const token   = core.getInput('github-token');
  const octokit = github.getOctokit(token);
  const { context } = github;
  const { owner, repo } = context.repo;

  // When FlakeHunt runs via workflow_run, context.payload.pull_request is
  // always undefined — the PR info lives at workflow_run.pull_requests[].
  // An empty array means this was a schedule, merge-to-main, or manual run.
  const prs = context.payload.workflow_run?.pull_requests ?? [];

  if (prs.length === 0) {
    // No PR associated (scheduled run, merge to main, manual dispatch)
    // — write to the Actions Run Summary tab instead
    core.info('No PR associated with this run — writing to Actions Run Summary');
    await core.summary.addRaw(buildComment(results)).write();
    return;
  }

  const prNumber = prs[0].number;
  const body     = buildComment(results);

  const { data: existing } = await octokit.rest.issues.listComments(
    { owner, repo, issue_number: prNumber }
  );

  const prev = existing.find(c =>
    c.body.includes('FlakeHunt Analysis') && c.user.type === 'Bot'
  );

  if (prev) {
    await octokit.rest.issues.updateComment(
      { owner, repo, comment_id: prev.id, body }
    );
  } else {
    await octokit.rest.issues.createComment(
      { owner, repo, issue_number: prNumber, body }
    );
  }
}

module.exports = { postComment };
