// test/flaky-selenium.java
// Selenium + TestNG flaky test patterns for verifying FlakeHunt's Selenium support.
// These mirror the real log format FlakeHunt will see from Java/TestNG CI pipelines
// (e.g. Apple Rio, internal Java test suites).
//
// Each test is intentionally written with the anti-pattern that causes the flakiness.
// FlakeHunt should classify each one correctly.

package com.example.tests;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.time.Duration;

public class FlakySeleniumTests {

    private WebDriver driver;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(5));
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pattern 1 · SELECTOR_FRAGILITY
    // Symptom : StaleElementReferenceException — DOM re-renders after the
    //           element reference was captured, making the reference stale.
    //           Mirrors the real Apple log: verifyAirpodsMaxCurrentRegularModelStep1
    // FlakeHunt should classify as SELECTOR_FRAGILITY and suggest wrapping
    // the interaction in an explicit wait + fresh findElement.
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    public void verifyProductTitleDisplayed() {
        driver.get("https://example.com/products/airpods-max");

        // Bad: element captured before page fully settles —
        // React/Angular re-renders the DOM after data loads, invalidating the ref
        WebElement title = driver.findElement(By.tagName("h1"));

        // Page re-renders here (async data load) → title reference goes stale
        String text = title.getText(); // throws StaleElementReferenceException

        Assert.assertEquals(text, "AirPods Max");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pattern 2 · ASYNC_TIMING
    // Symptom : Test proceeds before async content has finished loading.
    //           Thread.sleep is a hardcoded wait that races against CI runner speed.
    // FlakeHunt should classify as ASYNC_TIMING and suggest replacing
    // Thread.sleep with WebDriverWait + ExpectedConditions.
    // ─────────────────────────────────────────────────────────────────────────
    @Test
    public void verifyDashboardMetricsLoaded() throws InterruptedException {
        driver.get("https://example.com/dashboard");

        // Bad: hardcoded sleep — flaky on slow CI runners or under load
        Thread.sleep(2000);

        WebElement metric = driver.findElement(By.cssSelector(".metric-value"));
        Assert.assertNotNull(metric.getText());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pattern 3 · ENVIRONMENT_POLLUTION
    // Symptom : Test reads state written by a previous test via a shared
    //           static field. Fails when tests run in a different order or
    //           in parallel.
    // FlakeHunt should classify as ENVIRONMENT_POLLUTION and suggest
    // removing shared static state and isolating each test.
    // ─────────────────────────────────────────────────────────────────────────
    private static String lastCreatedUserId; // Bad: shared mutable static state

    @Test
    public void createUserAccount() {
        driver.get("https://example.com/register");
        driver.findElement(By.id("email")).sendKeys("testuser@example.com");
        driver.findElement(By.id("submit")).click();

        lastCreatedUserId = driver.findElement(By.id("user-id")).getText();
    }

    @Test(dependsOnMethods = "createUserAccount") // Bad: hard test-order dependency
    public void verifyUserProfileCreated() {
        // Fails if createUserAccount ran in a different thread or was skipped
        driver.get("https://example.com/users/" + lastCreatedUserId);

        WebElement name = driver.findElement(By.cssSelector(".user-display-name"));
        Assert.assertEquals(name.getText(), "testuser@example.com");
    }
}
