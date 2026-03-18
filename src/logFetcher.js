const core = require('@actions/core');
const github = require('@actions/github');
const AdmZip = require('adm-zip');

async function fetchFailedLogs() {
  const token = core.getInput('github-token');
  const octokit = github.getOctokit(token);
  const { context } = github;
  const { owner, repo } = context.repo;
  const runId = context.runId;

  // Get all jobs for this run
  const { data } = await octokit.rest.actions
    .listJobsForWorkflowRun({ owner, repo, run_id: runId });

  // Filter to failed jobs only
  const failedJobs = data.jobs.filter(j => j.conclusion === 'failure');
  if (failedJobs.length === 0) return null;

  const logs = [];
  for (const job of failedJobs) {
    // GitHub API returns redirect to signed ZIP URL
    const logResp = await octokit.rest.actions
      .downloadJobLogsForWorkflowRun({ owner, repo, job_id: job.id });

    const zip = new AdmZip(Buffer.from(logResp.data));
    let fullLog = '';
    zip.getEntries().forEach(e => {
      fullLog += e.getData().toString('utf8');
    });

    logs.push({ jobName: job.name, log: fullLog });
  }
  return logs;
}

module.exports = { fetchFailedLogs };
