function detectFramework(log) {
  if (log.includes('RemoteWebDriver') || log.includes('org.openqa.selenium')) return 'selenium';
  // Playwright detection: explicit header OR › separator OR line:col stack format
  // (Playwright includes column numbers e.g. spec.ts:71:13 — Jest only has line numbers)
  if (log.includes('@playwright') || log.includes(' › ') || /\.spec\.[tj]s:\d+:\d+/.test(log)) return 'playwright';
  if (log.includes('Cypress')     || log.includes('✗'))                                        return 'cypress';
  return 'jest';
}

const PATTERNS = {
  playwright: {
    fail:  /[×✕]\s+(.+?)\s*›\s*(.+)/,
    error: /(TimeoutError|Error|AssertionError):.+/m,
    file:  /(\w+\.spec\.[tj]s):(\d+)/,
  },
  cypress: {
    fail:  /✗\s+(.+)/,
    error: /(AssertionError|Error|Timed out):.+/m,
    file:  /(\w+\.cy\.[tj]s):(\d+)/,
  },
  jest: {
    fail:  /✕\s+(.+)/,
    // Note: Jest assertion errors are multi-line and handled by extractJestError()
    // This pattern is a fallback for TypeError / Cannot read style errors
    error: /(TypeError:[^\n]+|Cannot read[^\n]+|Error:[^\n]+)/m,
    file:  /(\w+\.(?:test|spec)\.[tj]s):(\d+)/,
  },
  // Selenium + TestNG: Java stack traces, no × markers.
  // Error lives in "Caused by:" line.
  // Test name + file come from the first user-space stack frame
  // (excludes java.base, org.testng, org.openqa internals).
  selenium: {
    error: /Caused by:\s*(org\.openqa\.selenium\.\w+|java\.[\w.]+Exception|[\w.]+Exception):\s*(.+)/,
    // User test frame: prioritise files ending in Test.java / Tests.java
    // to skip framework interceptors like ReportEnhancer, aspects, runners etc.
    frame: /at (?:app\/\/)?(?!java\.|org\.testng\.|org\.openqa\.|sun\.|jdk\.)([\w$.]+)\.([\w$]+)\(([\w$]*Tests?\.java):(\d+)\)/,
  },
};

// Selenium/TestNG logs use Java stack traces — no × ✕ ✗ markers.
// Split on "Caused by:" to isolate individual failure blocks.
function parseSeleniumFailures(rawLog) {
  const failures = [];
  const p = PATTERNS.selenium;

  // Each "Caused by:" line is the root of one failure
  const sections = rawLog.split(/(?=Caused by:)/);

  for (const section of sections) {
    const errorMatch = section.match(p.error);
    if (!errorMatch) continue;

    const exceptionType = errorMatch[1];
    const errorMessage  = errorMatch[2].trim();

    // Walk the full log (not just this section) to find the first user test frame
    const frameMatch = rawLog.match(p.frame);

    const className  = frameMatch ? frameMatch[1].split('.').pop() : 'Unknown';
    const methodName = frameMatch ? frameMatch[2] : 'Unknown';
    const fileName   = frameMatch ? frameMatch[3] : '';
    const lineNumber = frameMatch ? frameMatch[4] : '';

    failures.push({
      framework:    'selenium',
      testName:     className + '.' + methodName,
      errorMessage: exceptionType + ': ' + errorMessage,
      fileName,
      lineNumber,
      rawSection:   section.slice(0, 2000),
    });
  }
  return failures;
}

// Jest assertion errors span multiple lines:
//   expect(received).toHaveText(expected)
//   Expected: "Test User"
//   Received: null
// This function captures all three lines as a single error message.
// Falls back to TypeError / Cannot read / Error: for non-assertion failures.
function extractJestError(section) {
  // Multi-line assertion block: expect(...) + optional Expected/Received lines
  const assertion = section.match(
    /(expect\([^)]*\)\.[^\n]+(?:\n\s+(?:Expected|Received|✕)[^\n]*){0,3})/m
  );
  if (assertion) return assertion[1].replace(/\n\s+/g, ' · ').trim();

  // Fallback for thrown errors
  const thrown = section.match(/(TypeError:[^\n]+|Cannot read[^\n]+|Error:[^\n]+)/m);
  return thrown ? thrown[1] : '';
}

function parseFailures(rawLog) {
  const fw = detectFramework(rawLog);

  // Selenium has a completely different log structure — delegate to its own parser
  if (fw === 'selenium') return parseSeleniumFailures(rawLog);

  const p        = PATTERNS[fw];
  const failures = [];

  // Split into sections by test failure marker (Playwright / Cypress / Jest)
  const sections = rawLog.split(/\n(?=\s*[×✕✗])/);

  for (const section of sections) {
    if (!section.match(/[×✕✗]/)) continue;

    const nameMatch  = section.match(p.fail);
    const errorMatch = section.match(p.error);
    const fileMatch  = section.match(p.file);
    if (!nameMatch && !errorMatch) continue;

    failures.push({
      framework:    fw,
      testName:     nameMatch  ? nameMatch[0].replace(/[×✕✗]\s+/, '') : 'Unknown',
      errorMessage: fw === 'jest' ? extractJestError(section) : (errorMatch ? errorMatch[0] : ''),
      fileName:     fileMatch  ? fileMatch[1]  : '',
      lineNumber:   fileMatch  ? fileMatch[2]  : '',
      rawSection:   section.slice(0, 2000),
    });
  }

  // Fallback for Playwright logs from helpers/utilities that output a plain
  // error + stack without the test runner header (no × marker).
  // Example: assertion thrown from analyticsValidator.ts — the spec file only
  // appears at the bottom of the stack trace.
  if (fw === 'playwright' && failures.length === 0) {
    // Try numbered format first: "  1) [chromium] › file › Suite › test name"
    // This is the standard Playwright reporter output when run with --reporter=list
    const numbered = rawLog.split(/\n(?=\s+\d+\)\s)/);
    if (numbered.length > 1) {
      for (const section of numbered) {
        const errorMatch = section.match(p.error);
        if (!errorMatch) continue;

        // Extract full test name from "[chromium] › file:line:col › Suite › test name (Xms)"
        const titleMatch = section.match(/\[chromium\]\s+›\s+\S+\s+›\s+(.+?)(?:\s+\(\d+ms\))?[\r\n]/);
        const specMatch  = section.match(/\/([\w-]+\.spec\.[tj]s):(\d+):\d+/);

        failures.push({
          framework:    'playwright',
          testName:     titleMatch ? titleMatch[1].trim() : (specMatch ? specMatch[1].replace(/\.spec\.[tj]s$/, '') : 'Unknown'),
          errorMessage: errorMatch[0],
          fileName:     specMatch ? specMatch[1] : '',
          lineNumber:   specMatch ? specMatch[2] : '',
          rawSection:   section.slice(0, 2000),
        });
      }
    }

    // Plain single error fallback (no × and no numbered sections)
    // e.g. assertion thrown from a helper file like analyticsValidator.ts
    if (failures.length === 0) {
      const errorMatch = rawLog.match(p.error);
      const specMatch  = rawLog.match(/\/([\w-]+\.spec\.[tj]s):(\d+):\d+/);
      if (errorMatch) {
        failures.push({
          framework:    'playwright',
          testName:     specMatch ? specMatch[1].replace(/\.spec\.[tj]s$/, '') : 'Unknown',
          errorMessage: errorMatch[0],
          fileName:     specMatch ? specMatch[1] : '',
          lineNumber:   specMatch ? specMatch[2] : '',
          rawSection:   rawLog.slice(0, 2000),
        });
      }
    }
  }

  return failures;
}

module.exports = { parseFailures };
