const fs   = require('fs');
const path = require('path');

const template = fs.readFileSync(
  path.join(__dirname, '../prompts/classify.txt'), 'utf8'
);

const VALID = [
  'SELECTOR_FRAGILITY', 'ASYNC_TIMING',
  'DATA_DEPENDENCY', 'ENVIRONMENT_POLLUTION', 'NETWORK_INSTABILITY',
];

// ── Rules-based classifier (no AI, no cost) ────────────────────────────────
// Used when model-provider is 'rules-only'.
// Matches keywords in the error message and raw log section.
const RULES = [
  {
    category:  'SELECTOR_FRAGILITY',
    pattern:   /stale.?element|element.*not.*found|no such element|element.*detached|strict mode violation|locator.*\d+ element|css.*selector|xpath.*fail/i,
    reasoning: 'Element reference or selector issue detected in error message',
  },
  {
    category:  'ASYNC_TIMING',
    pattern:   /timeout|timed.?out|waitfor|thread\.sleep|wait.*exceed|navigation.*timeout|page\.goto.*timeout|animation/i,
    reasoning: 'Timing or async wait issue detected in error message',
  },
  {
    category:  'NETWORK_INSTABILITY',
    pattern:   /econnrefused|connection.?refused|err_connection|net::|503|504|dns.*fail|fetch.*fail/i,
    reasoning: 'Network or connection error detected in error message',
  },
  {
    category:  'DATA_DEPENDENCY',
    pattern:   /expected.*condition.*contains|not found in db|seed|fixture|no.*user.*found|test.?data.*missing|expected.*got/i,
    reasoning: 'Test data or fixture dependency detected in error message',
  },
  {
    category:  'ENVIRONMENT_POLLUTION',
    pattern:   /shared.?state|previous.?test|order.?depend|not.?reset|global.*variable|test.*isolation/i,
    reasoning: 'Test isolation or shared state issue detected in error message',
  },
];

function rulesBasedClassify(failure) {
  const text = (failure.errorMessage + ' ' + failure.rawSection).toLowerCase();
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return {
        ...failure,
        category:      rule.category,
        confidence:    75,
        reasoning:     rule.reasoning,
        primarySignal: failure.errorMessage.slice(0, 120),
      };
    }
  }
  return { ...failure, category: null, confidence: 0, reasoning: 'No rule matched' };
}

// ── AI classifier ──────────────────────────────────────────────────────────
// client is the unified chat function from aiClient.js (null = rules-only)
async function classifyFailure(failure, client) {
  if (!client) return rulesBasedClassify(failure);

  const prompt = template
    .replace('{{framework}}',    failure.framework)
    .replace('{{testName}}',     failure.testName)
    .replace('{{errorMessage}}', failure.errorMessage)
    .replace('{{rawSection}}',   failure.rawSection);

  try {
    const text = await client(prompt, 300, 'classify');
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);

    if (!VALID.includes(json.category)) throw new Error('Bad category: ' + json.category);

    return { ...failure, ...json };

  } catch (err) {
    console.error('Classify failed:', err.message);
    return { ...failure, category: null, confidence: 0 };
  }
}

module.exports = { classifyFailure };
