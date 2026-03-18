// test/run-parser.js
// Quick local test — runs all 4 framework log samples through logParser.
// Run with: node test/run-parser.js

const { parseFailures } = require('../src/logParser');

const LOGS = {

  // ── Real Playwright log (Apple) ────────────────────────────────────────────
  playwright_real: `AssertionError: Validation failed for key 'products': Expected condition contains('iphone_16e'), but got 'iphone_16;;;;;'.

   at ../support/helpers/analyticsValidator.ts:27

  25 |           console.error(\`Value mismatch for key '\${key}': Expected condition \${expectedCondition}, but got '\${actualValue}'.\`);
  26 |         }
> 27 |         assert.ok(isValid,\`Validation failed for key '\${key}': Expected condition \${expectedCondition}, but got '\${actualValue}'.\`);
     |                ^
  28 |       } else {
  29 |         const expectedStr = String(expectedValue);
  30 |         const actualStr = String(actualValue);
    at Function.validate (/workspace/support/helpers/analyticsValidator.ts:27:16)
    at TestFlowController.performValidation (/workspace/support/helpers/testFlowController.ts:57:28)
    at TestFlowController.validateStepAnalytics (/workspace/support/helpers/testFlowController.ts:47:14)
    at TestFlowController.executeStep (/workspace/support/helpers/testFlowController.ts:37:14)
    at TestFlowController.executeSteps (/workspace/support/helpers/testFlowController.ts:29:13)
    at BaseIPhoneHandler.executeFlow (/workspace/support/handlers/iphone/BaseiPhoneHandler.ts:450:9)
    at /workspace/tests/ui/lob/iphone/step1/pageload_tests.spec.js:71:13`,

  // ── Selenium + TestNG (Java) — real Apple log ──────────────────────────────
  selenium: `Element: [[RemoteWebDriver: chrome on linux (63886d5c2f3c976800eb59b8f2404e61)] -> tag name: h1]
Session ID: 63886d5c2f3c976800eb59b8f2404e61
    at app//com.apple.store.automation.framework.aspects.ReportEnhancer.aroundTestMethod(ReportEnhancer.java:229)
    at app//com.apple.store.automation.seo.airpods.AirPodsMaxCurrentRegularStep1Tests.verifyAirpodsMaxCurrentRegularModelStep1(AirPodsMaxCurrentRegularStep1Tests.java:29)
    at java.base@21.0.8/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103)
    at java.base@21.0.8/java.lang.reflect.Method.invoke(Method.java:580)
    at app//org.testng.internal.invokers.MethodInvocationHelper.invokeMethod(MethodInvocationHelper.java:135)
    at app//org.testng.internal.invokers.TestInvoker.invokeMethod(TestInvoker.java:673)
    at app//org.testng.internal.invokers.TestInvoker.retryFailed(TestInvoker.java:262)
    at app//org.testng.internal.invokers.MethodRunner.runInSequence(MethodRunner.java:62)
    at app//org.testng.internal.invokers.TestInvoker$MethodInvocationAgent.invoke(TestInvoker.java:945)
    at app//org.testng.internal.invokers.TestInvoker.invokeTestMethods(TestInvoker.java:193)
    at app//org.testng.internal.invokers.TestMethodWorker.invokeTestMethods(TestMethodWorker.java:146)
    at app//org.testng.internal.invokers.TestMethodWorker.run(TestMethodWorker.java:128)
    at java.base@21.0.8/java.util.ArrayList.forEach(ArrayList.java:1596)
    at app//org.testng.TestRunner.privateRun(TestRunner.java:808)
    at app//org.testng.TestRunner.run(TestRunner.java:603)
    at app//org.testng.SuiteRunner.runTest(SuiteRunner.java:429)
    at app//org.testng.SuiteRunner.access$000(SuiteRunner.java:32)
    at app//org.testng.SuiteRunner$SuiteWorker.run(SuiteRunner.java:467)
    at app//org.testng.internal.thread.ThreadUtil.lambda$execute$0(ThreadUtil.java:58)
    at java.base@21.0.8/java.util.concurrent.FutureTask.run(FutureTask.java:317)
    at java.base@21.0.8/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1144)
    at java.base@21.0.8/java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:642)
    at java.base@21.0.8/java.lang.Thread.run(Thread.java:1583)
Caused by: org.openqa.selenium.StaleElementReferenceException: stale element reference: stale element not found in the current frame`,

  // ── Playwright ─────────────────────────────────────────────────────────────
  playwright: `
  × checkout › submit checkout form (8.3s)

    TimeoutError: page.click: Timeout 5000ms exceeded.
    Call log:
      - waiting for selector '.btn-primary.submit'

      at checkout.spec.ts:14`,

  // ── Jest ───────────────────────────────────────────────────────────────────
  jest: `
  ✕ user profile page renders correctly (234ms)

    expect(received).toHaveText(expected)
    Expected: "Test User"
    Received: null

    Cannot read properties of null (reading 'textContent')

      at tests/profile.test.ts:22`,

  // ── Cypress ────────────────────────────────────────────────────────────────
  cypress: `
  ✗ dashboard data loads after navigation

    AssertionError: Timed out retrying after 4000ms:
    Expected to find element '.metric-value' but never found it.

      at dashboard.cy.ts:18`,
};

// ── Run all four ─────────────────────────────────────────────────────────────
Object.entries(LOGS).forEach(([label, log]) => {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(' ' + label.toUpperCase() + ' LOG');
  console.log('══════════════════════════════════════════════════════════');

  const results = parseFailures(log);

  if (results.length === 0) {
    console.log('❌ No failures extracted');
    return;
  }

  results.forEach((r, i) => {
    console.log(`\n  ✅ Failure ${i + 1} extracted:`);
    console.log('     framework   :', r.framework);
    console.log('     testName    :', r.testName);
    console.log('     errorMessage:', r.errorMessage);
    console.log('     fileName    :', r.fileName);
    console.log('     lineNumber  :', r.lineNumber);
  });
});

console.log('\n');
