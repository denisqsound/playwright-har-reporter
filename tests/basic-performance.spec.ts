import { test, expect } from '@playwright/test';
import { TestPage } from '../pages/test.page';

test.describe('Basic Performance Monitoring', () => {
    test('Simple page loads with HAR recording', async ({ browser }) => {
        test.setTimeout(60000);

        // Create page using PageObjectModel with performance monitoring
        const testPage = await TestPage.create(browser, {
            enableMonitoring: true
        });

        await test.step('Load example.com', async () => {
            await testPage.navigate('https://example.com');
            await testPage.waitForPageLoad();
            const title = await testPage.getPageTitle();
            expect(title).toContain('Example');
        });

        await test.step('Load Google', async () => {
            await testPage.navigate('https://www.google.com');
            await testPage.page.waitForLoadState('domcontentloaded');
            const title = await testPage.getPageTitle();
            expect(title).toContain('Google');
        });

        await test.step('Load Playwright.dev', async () => {
            await testPage.navigate('https://playwright.dev');
            await testPage.waitForPageLoad();
            const title = await testPage.getPageTitle();
            expect(title).toContain('Playwright');
        });

        // Close and generate report
        await test.step('Generate performance report', async () => {
            // Close page and get performance report
            const report = await testPage.close();

            expect(report).toBeTruthy();

            if (report) {
                console.log('\n========================================');
                console.log('PERFORMANCE MONITORING REPORT');
                console.log('========================================');
                console.log(`Test: ${report.testName}`);
                console.log(`HAR: ${report.harFile}`);
                console.log(`Duration: ${(report.testDuration / 1000).toFixed(2)}s`);

                console.log('\n📊 Summary:');
                console.log(`  Total Requests: ${report.summary.totalRequests}`);
                console.log(`  Failed Requests: ${report.summary.failedRequests}`);
                console.log(`  Total Size: ${(report.summary.totalSize / 1024 / 1024).toFixed(2)} MB`);
                console.log(`  Avg Response: ${report.summary.averageResponseTime.toFixed(0)}ms`);
                console.log(`  Median Response: ${report.summary.medianResponseTime.toFixed(0)}ms`);
                console.log(`  P95: ${report.summary.percentile95.toFixed(0)}ms`);
                console.log(`  P99: ${report.summary.percentile99.toFixed(0)}ms`);

                if (report.requestTypes && Object.keys(report.requestTypes).length > 0) {
                    console.log('\n📁 Request Types:');
                    Object.entries(report.requestTypes).forEach(([type, metrics]: [string, any]) => {
                        console.log(`  ${type}: ${metrics.count} requests`);
                    });
                }

                if (report.performance?.slowestRequests?.length > 0) {
                    console.log('\n🐢 Slowest Requests:');
                    report.performance.slowestRequests.slice(0, 3).forEach((req: any, i: number) => {
                        const url = new URL(req.url);
                        console.log(`  ${i+1}. ${url.hostname}${url.pathname.substring(0, 30)}: ${req.time}ms`);
                    });
                }

                console.log('========================================\n');

                // Verify metrics
                expect(report.summary.totalRequests).toBeGreaterThan(0);

                console.log(`✅ Test completed successfully with ${report.summary.totalRequests} requests`);
            }
        });
    });
});