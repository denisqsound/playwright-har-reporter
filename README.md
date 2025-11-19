# Playwright HAR Reporter

A comprehensive performance monitoring and HAR (HTTP Archive) recording solution for Playwright tests. This toolkit provides detailed network performance analysis, request categorization, and automated reporting for your end-to-end tests.

## Features

- **HAR Recording**: Automatic HTTP Archive recording for all network requests
- **Performance Metrics**: Detailed analysis including response times, percentiles (P95, P99), and request statistics
- **Request Categorization**: Automatic categorization of requests by type (API, JavaScript, CSS, images, fonts, HTML)
- **API Monitoring**: Special tracking and metrics for API endpoints
- **Custom Metrics**: Support for adding custom performance measurements
- **Performance Thresholds**: Set and validate performance budgets
- **HTML & JSON Reports**: Dual-format reporting with visual HTML dashboards and structured JSON data
- **Browser Metrics**: Capture DOM timing, paint metrics, and navigation performance
- **Error Tracking**: Monitor console errors and failed requests

## Installation

```bash
npm install
```

## Quick Start

### Basic Usage

```typescript
import { test } from '@playwright/test';
import { PerformanceMonitor } from './helpers/performance-monitor';

test('Basic performance test', async ({ browser }) => {
  const monitor = new PerformanceMonitor({
    testName: 'my-performance-test'
  });

  const page = await monitor.createPage(browser);

  await page.goto('https://example.com');

  await monitor.close();
  const report = await monitor.generateReport();

  console.log(`Total requests: ${report.summary.totalRequests}`);
  console.log(`Average response time: ${report.summary.averageResponseTime}ms`);
});
```

### Using Page Object Model

```typescript
import { TestPage } from './pages/test.page';

test('POM with monitoring', async ({ browser }) => {
  const testPage = await TestPage.create(browser, {
    enableMonitoring: true
  });

  await testPage.navigate('https://example.com');
  await testPage.waitForPageLoad();

  const report = await testPage.close();
  // Report is automatically generated
});
```

### Static Helper Method

```typescript
import { PerformanceMonitor } from './helpers/performance-monitor';

test('Using runWithMonitoring', async ({ browser }) => {
  const { result, report } = await PerformanceMonitor.runWithMonitoring(
    browser,
    'my-test',
    async (page, monitor) => {
      await page.goto('https://example.com');

      // Add custom metrics
      monitor.addMetric('customValue', 123);

      // Measure specific operations
      await monitor.measure('search', async () => {
        await page.fill('#search', 'test');
        await page.click('#submit');
      });

      return 'test completed';
    },
    {
      recordHarMode: 'minimal',
      captureScreenshots: true
    },
    {
      maxAverageResponseTime: 1000,
      maxFailedRequests: 0
    }
  );

  console.log(`Test result: ${result}`);
  console.log(`Performance report generated: ${report?.harFile}`);
});
```

## Configuration Options

### PerformanceMonitorConfig

```typescript
interface PerformanceMonitorConfig {
  testName?: string;              // Name for the test (default: 'performance-test')
  harDir?: string;                // Directory for HAR files (default: './test-results/har')
  reportDir?: string;             // Directory for reports (default: './test-results/reports')
  recordHarMode?: 'full' | 'minimal'; // HAR recording mode (default: 'full')
  captureScreenshots?: boolean;   // Enable screenshot capture (default: false)
  customMetrics?: Record<string, any>; // Initial custom metrics
}
```

### Performance Thresholds

```typescript
interface PerformanceThresholds {
  maxAverageResponseTime?: number;  // Maximum average response time in ms
  maxFailedRequests?: number;       // Maximum number of failed requests
  maxTotalTime?: number;            // Maximum total test duration in ms
  maxRequestTime?: number;          // Maximum single request time in ms
  maxPageLoadTime?: number;         // Maximum page load time in ms
}
```

## API Reference

### PerformanceMonitor Class

#### Constructor

```typescript
const monitor = new PerformanceMonitor(config?: PerformanceMonitorConfig);
```

#### Methods

**createContext(browser, storageState?)**
- Creates a new browser context with HAR recording enabled
- Returns: `Promise<BrowserContext>`

**createPage(browser, storageState?)**
- Creates a new page with performance monitoring
- Returns: `Promise<Page>`

**setThresholds(thresholds)**
- Sets performance thresholds for validation
- Parameters: `PerformanceThresholds`

**addMetric(key, value)**
- Adds a custom metric to the report
- Parameters: `key: string, value: any`

**measure(name, fn)**
- Measures the execution time of a function
- Parameters: `name: string, fn: () => Promise<T>`
- Returns: `Promise<T>`

**captureBrowserMetrics()**
- Captures browser performance metrics (navigation timing, paint metrics)
- Returns: `Promise<void>`

**close()**
- Closes the context and saves HAR file
- Returns: `Promise<string>` (HAR file path)

**generateReport(outputPath?)**
- Generates detailed performance report in JSON and HTML formats
- Returns: `Promise<PerformanceReport | null>`

#### Static Methods

**wrapContext(browser, config?, storageState?)**
- Creates a context with monitoring wrapper
- Returns: `Promise<{ context: BrowserContext; monitor: PerformanceMonitor }>`

**runWithMonitoring(browser, testName, testFn, config?, thresholds?)**
- Runs a test with complete performance monitoring
- Returns: `Promise<{ result: T; report: PerformanceReport | null }>`

## Performance Report Structure

The generated report includes:

### Summary
- Total requests count
- Total time and size
- Failed requests count
- Average, median, P95, and P99 response times

### Request Types
Categorized metrics for:
- API calls
- JavaScript files
- CSS files
- Images
- Fonts
- HTML documents
- Other resources

### Performance Details
- Slowest requests (top 10)
- Failed requests (all)
- Largest requests (top 5)

### API Metrics
- Total API calls
- Per-endpoint metrics:
  - Call count
  - Average, min, max response times
  - Total time

### Custom Metrics
- Browser metrics (DOM timing, paint events)
- Console errors
- Page crashes
- Custom added metrics

### Threshold Violations
- List of any exceeded thresholds
- Threshold vs actual values

## Running Tests

```bash
# Run all tests
npm test

# Run specific performance test
npm run test:performance

# Run with UI mode
npm run test:ui

# Run with debug mode
npm run test:debug

# View HTML report
npm run report
```

## Generated Files

### HAR Files
Location: `./test-results/har/`
- Format: `{testName}-{timestamp}.har`
- Contains: Complete HTTP archive of all network requests

### Reports
Location: `./test-results/reports/`
- JSON: `report-{testName}-{timestamp}.json`
- HTML: `report-{testName}-{timestamp}.html`

## Advanced Usage

### Custom Metrics

```typescript
const monitor = new PerformanceMonitor({ testName: 'custom-metrics-test' });
const page = await monitor.createPage(browser);

// Add custom metrics
monitor.addMetric('userId', '12345');
monitor.addMetric('testEnvironment', 'staging');

// Measure specific operations
await monitor.measure('login', async () => {
  await page.fill('#username', 'user');
  await page.fill('#password', 'pass');
  await page.click('#login');
});

await monitor.measure('dataLoad', async () => {
  await page.waitForSelector('.data-loaded');
});

await monitor.close();
const report = await monitor.generateReport();
```

### Performance Budgets

```typescript
const thresholds: PerformanceThresholds = {
  maxAverageResponseTime: 500,  // 500ms average
  maxFailedRequests: 0,         // No failures allowed
  maxTotalTime: 5000,           // 5 second max test duration
  maxRequestTime: 2000,         // 2 second max per request
  maxPageLoadTime: 3000         // 3 second page load
};

monitor.setThresholds(thresholds);

// After generating report, check violations
const report = await monitor.generateReport();
if (report?.thresholdViolations && report.thresholdViolations.length > 0) {
  console.error('Performance budget exceeded!');
  report.thresholdViolations.forEach(v => {
    console.error(`${v.message}: ${v.actual} > ${v.threshold}`);
  });
}
```

### Storage State & Authentication

```typescript
// Save authenticated state
const { context, monitor } = await PerformanceMonitor.wrapContext(
  browser,
  { testName: 'auth-test' }
);

const page = await context.newPage();
await page.goto('https://example.com/login');
await page.fill('#username', 'user');
await page.fill('#password', 'pass');
await page.click('#login');

await context.storageState({ path: 'auth.json' });
await monitor.close();

// Reuse authenticated state
const monitor2 = new PerformanceMonitor({ testName: 'reuse-auth' });
const page2 = await monitor2.createPage(browser, 'auth.json');
// Already logged in
```

## Report Analysis

The HTML report provides:
- Visual dashboard with key metrics
- Color-coded indicators for pass/fail status
- Detailed tables for request breakdown
- Threshold violation alerts
- Exportable JSON data for CI/CD integration

## Best Practices

1. **Naming**: Use descriptive test names for easy report identification
2. **Thresholds**: Set realistic performance budgets based on baseline metrics
3. **Cleanup**: Always call `monitor.close()` to ensure HAR files are saved
4. **Categorization**: Use consistent URL patterns for accurate request categorization
5. **CI Integration**: Parse JSON reports in CI pipelines for automated performance validation

## Troubleshooting

### HAR file not found
- Ensure `monitor.close()` is called before generating reports
- Check directory permissions for HAR output location

### Empty reports
- Verify network requests are being made during test execution
- Check if HAR recording is properly initialized

### Missing metrics
- Call `captureBrowserMetrics()` before closing the monitor
- Ensure page events (load, domcontentloaded) are triggered

## Requirements

- Node.js 16+
- Playwright 1.56+
- TypeScript 5.0+

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Support

For issues and questions, please open an issue on GitHub.
