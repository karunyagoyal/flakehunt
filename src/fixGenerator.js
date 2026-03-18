const GUIDANCE = {
  SELECTOR_FRAGILITY:    'Switch to data-testid attributes or ARIA roles. Show before/after diff.',
  ASYNC_TIMING:          'Replace hardcoded waits with explicit waitForResponse or waitForSelector.',
  DATA_DEPENDENCY:       'Add beforeEach to seed required data or use test fixtures.',
  ENVIRONMENT_POLLUTION: 'Add afterEach cleanup, reset global state, use test isolation.',
  NETWORK_INSTABILITY:   'Mock the external API call. Show the intercept/mock setup code.',
};

// client is the unified chat function from aiClient.js (null = rules-only, skip fix)
async function generateFix(classified, client) {
  const { category, confidence, testName,
          errorMessage, rawSection, framework } = classified;

  if (!category || confidence < 70) return null;

  // rules-only provider: no AI available for fix generation
  if (!client) return null;

  const prompt = [
    'You are a senior QA engineer.',
    '',
    'Flaky test classified as: ' + category,
    'Test: ' + testName,
    'Framework: ' + framework,
    'Error: ' + errorMessage,
    'Context: ' + rawSection.slice(0, 800),
    '',
    'Fix guidance: ' + GUIDANCE[category],
    '',
    'Write a specific fix for THIS test using its actual code.',
    '',
    'Format:',
    '### What is wrong',
    '[one sentence]',
    '',
    '### Fix',
    '```diff',
    '- [the bad line]',
    '+ [the fixed line]',
    '```',
    '',
    '### Why this works',
    '[one sentence]',
  ].join('\n');

  try {
    return await client(prompt, 500, 'fix');
  } catch (err) {
    console.error('Fix failed:', err.message);
    return null;
  }
}

module.exports = { generateFix };
