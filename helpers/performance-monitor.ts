/// <reference types="node" />
// performance-monitor.ts
import { Browser, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

export interface PerformanceMonitorConfig {
    testName?: string;
    harDir?: string;
    reportDir?: string;
    recordHarMode?: 'full' | 'minimal';
    captureScreenshots?: boolean;
    customMetrics?: Record<string, any>;
}

export interface PerformanceReport {
    timestamp: string;
    harFile: string;
    testName?: string;
    testDuration: number;
    summary: {
        totalRequests: number;
        totalTime: number;
        totalSize: number;
        failedRequests: number;
        averageResponseTime: number;
        medianResponseTime: number;
        percentile95: number;
        percentile99: number;
    };
    requestTypes: Record<string, RequestTypeMetrics>;
    performance: {
        slowestRequests: RequestInfo[];
        failedRequests: FailedRequestInfo[];
        largestRequests: LargeRequestInfo[];
    };
    apiMetrics: ApiMetrics;
    customMetrics?: Record<string, any>;
    thresholdViolations?: ThresholdViolation[];
}

interface RequestTypeMetrics {
    count: number;
    totalTime: number;
    totalSize: number;
    averageTime?: number;
}

interface RequestInfo {
    url: string;
    method: string;
    time: number;
    status: number;
}

interface FailedRequestInfo extends RequestInfo {
    statusText: string;
}

interface LargeRequestInfo {
    url: string;
    size: number;
    time: number;
}

interface ApiMetrics {
    totalCalls: number;
    endpoints: Record<string, EndpointMetrics>;
}

interface EndpointMetrics {
    count: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
}

interface ThresholdViolation {
    metric: string;
    threshold: number;
    actual: number;
    message: string;
}

export interface PerformanceThresholds {
    maxAverageResponseTime?: number;
    maxFailedRequests?: number;
    maxTotalTime?: number;
    maxRequestTime?: number;
    maxPageLoadTime?: number;
}

export class PerformanceMonitor {
    private context?: BrowserContext;
    private page?: Page;
    private harPath: string;
    private config: PerformanceMonitorConfig;
    private startTime?: number;
    private endTime?: number;
    private customMetrics: Record<string, any> = {};
    private thresholds?: PerformanceThresholds;

    constructor(config: PerformanceMonitorConfig = {}) {
        this.config = {
            harDir: config.harDir || path.join(process.cwd(), 'test-results/har'),
            reportDir: config.reportDir || path.join(process.cwd(),
                'test-results/reports'),
            recordHarMode: config.recordHarMode || 'full',
            captureScreenshots: config.captureScreenshots || false,
            testName: config.testName || 'performance-test',
            customMetrics: config.customMetrics || {}
        };

// Create directories if they don't exist
        this.ensureDirectoryExists(this.config.harDir!);
        this.ensureDirectoryExists(this.config.reportDir!);

// Generate HAR file path
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.harPath = path.join(
            this.config.harDir!,
            `${this.config.testName}-${timestamp}.har`
        );
    }

    /**
     * Creates a new browser context with HAR recording enabled
     */
    async createContext(browser: Browser, storageState?: string):
        Promise<BrowserContext> {
        const contextOptions: any = {
            recordHar: {
                path: this.harPath,
                mode: this.config.recordHarMode
            }
        };

        if (storageState) {
            contextOptions.storageState = storageState;
        }

        this.context = await browser.newContext(contextOptions);
        this.startTime = Date.now();

        return this.context;
    }

    /**
     * Creates a new page with performance monitoring
     */
    async createPage(browser: Browser, storageState?: string): Promise<Page> {
        if (!this.context) {
            await this.createContext(browser, storageState);
        }

        this.page = await this.context!.newPage();

// Add performance event listeners
        this.attachPerformanceListeners(this.page);

        return this.page;
    }

    /**
     * Wraps an existing context with HAR recording
     */
    static async wrapContext(
        browser: Browser,
        config: PerformanceMonitorConfig = {},
        storageState?: string
    ): Promise<{ context: BrowserContext; monitor: PerformanceMonitor }> {
        const monitor = new PerformanceMonitor(config);
        const context = await monitor.createContext(browser, storageState);

        return { context, monitor };
    }

    /**
     * Attaches performance event listeners to a page
     */
    private attachPerformanceListeners(page: Page): void {
// Monitor console errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                if (!this.customMetrics.consoleErrors) {
                    this.customMetrics.consoleErrors = [];
                }
                this.customMetrics.consoleErrors.push({
                    text: msg.text(),
                    location: msg.location()
                });
            }
        });

// Monitor page crashes
        page.on('crash', () => {
            this.customMetrics.pageCrashed = true;
        });

// Monitor DOM Content Loaded
        page.on('domcontentloaded', () => {
            if (this.startTime) {
                this.customMetrics.domContentLoadedTime = Date.now() - this.startTime;
            }
        });

// Monitor page load
        page.on('load', () => {
            if (this.startTime) {
                this.customMetrics.pageLoadTime = Date.now() - this.startTime;
            }
        });
    }

    /**
     * Sets performance thresholds for validation
     */
    setThresholds(thresholds: PerformanceThresholds): void {
        this.thresholds = thresholds;
    }

    /**
     * Adds a custom metric
     */
    addMetric(key: string, value: any): void {
        this.customMetrics[key] = value;
    }

    /**
     * Measures the execution time of a function
     */
    async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;
            this.addMetric(`timing_${name}`, duration);
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.addMetric(`timing_${name}_failed`, duration);
            throw error;
        }
    }

    /**
     * Captures browser performance metrics
     */
    async captureBrowserMetrics(): Promise<void> {
        if (!this.page) return;

        try {
            const metrics = await this.page.evaluate(() => {
                const navigation = performance.getEntriesByType('navigation')[0] as
                    PerformanceNavigationTiming;
                const paint = performance.getEntriesByType('paint');

                return {
                    navigation: navigation ? {
                        domContentLoaded: navigation.domContentLoadedEventEnd -
                            navigation.domContentLoadedEventStart,
                        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
                        domInteractive: navigation.domInteractive - navigation.fetchStart,
                        responseTime: navigation.responseEnd - navigation.requestStart
                    } : null,
                    paint: paint.map(p => ({
                        name: p.name,
                        startTime: p.startTime
                    }))
                };
            });

            this.customMetrics.browserMetrics = metrics;
        } catch (error) {
            console.warn('Failed to capture browser metrics:', error);
        }
    }

    /**
     * Closes the context and saves HAR file
     */
    async close(): Promise<string> {
        this.endTime = Date.now();

// Capture final metrics before closing
        await this.captureBrowserMetrics();

        if (this.context) {
            await this.context.close();
        }

        return this.harPath;
    }

    /**
     * Generates a detailed performance report
     */
    async generateReport(outputPath?: string): Promise<PerformanceReport | null> {
        if (!fs.existsSync(this.harPath)) {
            console.error(`HAR file not found: ${this.harPath}`);
            return null;
        }

        let harData: any;
        try {
            harData = JSON.parse(fs.readFileSync(this.harPath, 'utf8'));
        } catch (error) {
            console.error('Failed to parse HAR file:', error);
            return null;
        }

        const entries = harData?.log?.entries || [];

        if (entries.length === 0) {
            console.warn('No entries found in HAR file');
            return null;
        }

        const report: PerformanceReport = {
            timestamp: new Date().toISOString(),
            harFile: this.harPath,
            testName: this.config.testName,
            testDuration: this.endTime && this.startTime ?
                this.endTime - this.startTime :
                this.calculateTestDuration(entries),
            summary: this.calculateSummary(entries),
            requestTypes: this.categorizeRequests(entries),
            performance: {
                slowestRequests: this.getSlowRequests(entries, 10),
                failedRequests: this.getFailedRequests(entries),
                largestRequests: this.getLargestRequests(entries, 5)
            },
            apiMetrics: this.getApiMetrics(entries),
            customMetrics: this.customMetrics
        };

// Check thresholds
        if (this.thresholds) {
            report.thresholdViolations = this.checkThresholds(report);
        }

// Save report
        const reportPath = outputPath || path.join(
            this.config.reportDir!,
            `report-${this.config.testName}-${Date.now()}.json`
        );

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

// Generate HTML report
        await this.generateHtmlReport(report, reportPath.replace('.json', '.html'));

        return report;
    }

    /**
     * Generates an HTML report
     */
    private async generateHtmlReport(report: PerformanceReport,
                                     outputPath: string): Promise<void> {
        const html = `
<!DOCTYPE html>
<html>
<head>
<title>Performance Report - ${report.testName}</title>
<style>
body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
.header { background: #333; color: white; padding: 20px; border-radius: 5px; }
.section { background: white; margin: 20px 0; padding: 20px;
border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.metric { display: inline-block; margin: 10px 20px 10px 0; }
.metric-value { font-size: 24px; font-weight: bold; color: #333; }
.metric-label { color: #666; font-size: 14px; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
th { background: #f0f0f0; padding: 10px; text-align: left; }
td { padding: 10px; border-bottom: 1px solid #eee; }
.failed { color: #d32f2f; }
.warning { color: #f57c00; }
.success { color: #388e3c; }
.violation { background: #ffebee; border-left: 4px solid #d32f2f;
padding: 10px; margin: 10px 0; }
</style>
</head>
<body>
<div class="header">
<h1>Performance Report: ${report.testName || 'Test'}</h1>
<p>Generated: ${report.timestamp}</p>
<p>Duration: ${(report.testDuration / 1000).toFixed(2)}s</p>
</div>

${this.renderThresholdViolations(report.thresholdViolations)}

<div class="section">
<h2>Summary</h2>
<div class="metric">
<div class="metric-value">${report.summary.totalRequests}</div>
<div class="metric-label">Total Requests</div>
</div>
<div class="metric">
<div class="metric-value">${report.summary.averageResponseTime.toFixed(0)}ms</div>
<div class="metric-label">Avg Response Time</div>
</div>
<div class="metric">
<div class="metric-value ${report.summary.failedRequests > 0 ?
            'failed' : 'success'}">
${report.summary.failedRequests}
</div>
<div class="metric-label">Failed Requests</div>
</div>
<div class="metric">
<div class="metric-value">${(report.summary.totalSize / 1024 /
            1024).toFixed(2)}MB</div>
<div class="metric-label">Total Size</div>
</div>
</div>

<div class="section">
<h2>Request Types</h2>
<table>
<thead>
<tr>
<th>Type</th>
<th>Count</th>
<th>Total Time (ms)</th>
<th>Avg Time (ms)</th>
</tr>
</thead>
<tbody>
${Object.entries(report.requestTypes).map(([type, metrics]) => `
<tr>
<td>${type}</td>
<td>${metrics.count}</td>
<td>${metrics.totalTime.toFixed(0)}</td>
<td>${metrics.averageTime?.toFixed(0) || '-'}</td>
</tr>
`).join('')}
</tbody>
</table>
</div>
</body>
</html>
`;

        fs.writeFileSync(outputPath, html);
    }

    private renderThresholdViolations(violations?: ThresholdViolation[]): string {
        if (!violations || violations.length === 0) return '';

        return `
<div class="section">
<h2>Threshold Violations</h2>
${violations.map(v => `
<div class="violation">
<strong>${v.message}</strong><br>
Threshold: ${v.threshold}, Actual: ${v.actual.toFixed(2)}
</div>
`).join('')}
</div>
`;
    }

    private truncateUrl(url: string, maxLength: number = 80): string {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength) + '...';
    }

    private checkThresholds(report: PerformanceReport): ThresholdViolation[] {
        const violations: ThresholdViolation[] = [];

        if (!this.thresholds) return violations;

        if (this.thresholds.maxAverageResponseTime &&
            report.summary.averageResponseTime > this.thresholds.maxAverageResponseTime) {
            violations.push({
                metric: 'averageResponseTime',
                threshold: this.thresholds.maxAverageResponseTime,
                actual: report.summary.averageResponseTime,
                message: `Average response time exceeded threshold`
            });
        }

        if (this.thresholds.maxFailedRequests !== undefined &&
            report.summary.failedRequests > this.thresholds.maxFailedRequests) {
            violations.push({
                metric: 'failedRequests',
                threshold: this.thresholds.maxFailedRequests,
                actual: report.summary.failedRequests,
                message: `Failed requests exceeded threshold`
            });
        }

        return violations;
    }

    private calculateSummary(entries: any[]): PerformanceReport['summary'] {
        if (!entries || entries.length === 0) {
            return {
                totalRequests: 0,
                totalTime: 0,
                totalSize: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                medianResponseTime: 0,
                percentile95: 0,
                percentile99: 0
            };
        }

        const times = entries.map(e => e.time || 0);
        const totalTime = times.reduce((sum, t) => sum + t, 0);

        return {
            totalRequests: entries.length,
            totalTime: totalTime,
            totalSize: entries.reduce((sum, e) => sum + (e.response?.bodySize || 0), 0),
            failedRequests: entries.filter(e => e.response?.status >= 400).length,
            averageResponseTime: entries.length > 0 ? totalTime / entries.length : 0,
            medianResponseTime: this.calculateMedian(times),
            percentile95: this.calculatePercentile(times, 95),
            percentile99: this.calculatePercentile(times, 99)
        };
    }

    private calculateTestDuration(entries: any[]): number {
        if (!entries || entries.length === 0) return 0;

        const startTimes = entries.map(e => new Date(e.startedDateTime).getTime());
        const endTimes = entries.map(e =>
            new Date(e.startedDateTime).getTime() + (e.time || 0)
        );

        return Math.max(...endTimes) - Math.min(...startTimes);
    }

    private calculateMedian(values: number[]): number {
        if (!values || values.length === 0) return 0;

        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    private calculatePercentile(values: number[], percentile: number): number {
        if (!values || values.length === 0) return 0;

        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;

        return sorted[Math.max(0, index)];
    }

    private categorizeRequests(entries: any[]): Record<string,
        RequestTypeMetrics> {
        const categories: Record<string, RequestTypeMetrics> = {
            api: { count: 0, totalTime: 0, totalSize: 0 },
            javascript: { count: 0, totalTime: 0, totalSize: 0 },
            css: { count: 0, totalTime: 0, totalSize: 0 },
            images: { count: 0, totalTime: 0, totalSize: 0 },
            fonts: { count: 0, totalTime: 0, totalSize: 0 },
            html: { count: 0, totalTime: 0, totalSize: 0 },
            other: { count: 0, totalTime: 0, totalSize: 0 }
        };

        if (!entries || entries.length === 0) return categories;

        entries.forEach(entry => {
            const url = entry.request?.url || '';
            const mimeType = entry.response?.content?.mimeType || '';
            let category = 'other';

// Determine category by URL patterns and MIME types
            if (url.includes('/api/') || url.includes('graphql') ||
                url.includes('/rest/') || mimeType.includes('json')) {
                category = 'api';
            } else if (url.match(/\.(js|mjs|jsx|ts|tsx)$/i) ||
                mimeType.includes('javascript')) {
                category = 'javascript';
            } else if (url.match(/\.(css|scss|sass|less)$/i) || mimeType.includes('css')) {
                category = 'css';
            } else if (url.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i) ||
                mimeType.includes('image')) {
                category = 'images';
            } else if (url.match(/\.(woff|woff2|ttf|eot|otf)$/i) ||
                mimeType.includes('font')) {
                category = 'fonts';
            } else if (url.match(/\.(html|htm)$/i) || mimeType.includes('html')) {
                category = 'html';
            }

            categories[category].count++;
            categories[category].totalTime += entry.time || 0;
            categories[category].totalSize += entry.response?.bodySize || 0;
        });

// Calculate averages
        Object.keys(categories).forEach(key => {
            if (categories[key].count > 0) {
                categories[key].averageTime = categories[key].totalTime /
                    categories[key].count;
            }
        });

        return categories;
    }

    private getSlowRequests(entries: any[], limit: number): RequestInfo[] {
        if (!entries || entries.length === 0) return [];

        return entries
            .filter(e => e.request && e.response)
            .sort((a, b) => (b.time || 0) - (a.time || 0))
            .slice(0, limit)
            .map(e => ({
                url: e.request.url || '',
                method: e.request.method || '',
                time: e.time || 0,
                status: e.response.status || 0
            }));
    }

    private getFailedRequests(entries: any[]): FailedRequestInfo[] {
        if (!entries || entries.length === 0) return [];

        return entries
            .filter(e => e.response?.status >= 400)
            .map(e => ({
                url: e.request?.url || '',
                method: e.request?.method || '',
                status: e.response.status,
                statusText: e.response.statusText || '',
                time: e.time || 0
            }));
    }

    private getLargestRequests(entries: any[], limit: number): LargeRequestInfo[] {
        if (!entries || entries.length === 0) return [];

        return entries
            .filter(e => e.response?.bodySize)
            .sort((a, b) => (b.response?.bodySize || 0) - (a.response?.bodySize || 0))
            .slice(0, limit)
            .map(e => ({
                url: e.request?.url || '',
                size: e.response.bodySize || 0,
                time: e.time || 0
            }));
    }

    private getApiMetrics(entries: any[]): ApiMetrics {
        if (!entries || entries.length === 0) {
            return { totalCalls: 0, endpoints: {} };
        }

        const apiCalls = entries.filter(e => {
            const url = e.request?.url || '';
            const mimeType = e.response?.content?.mimeType || '';

            return url.includes('/api/') ||
                url.includes('graphql') ||
                url.includes('/rest/') ||
                url.includes('/SXMain/') ||
                url.includes('/moduleservices/') ||
                mimeType.includes('json');
        });

        if (apiCalls.length === 0) {
            return { totalCalls: 0, endpoints: {} };
        }

        const endpoints: Record<string, EndpointMetrics> = {};

        apiCalls.forEach(call => {
            try {
                const url = new URL(call.request.url);
                const key = `${call.request.method} ${url.pathname}`;

                if (!endpoints[key]) {
                    endpoints[key] = {
                        count: 0,
                        totalTime: 0,
                        averageTime: 0,
                        minTime: Infinity,
                        maxTime: 0
                    };
                }

                const time = call.time || 0;
                endpoints[key].count++;
                endpoints[key].totalTime += time;
                endpoints[key].minTime = Math.min(endpoints[key].minTime, time);
                endpoints[key].maxTime = Math.max(endpoints[key].maxTime, time);
            } catch (error) {
// Skip invalid URLs
                console.warn('Invalid URL in API metrics:', call.request?.url);
            }
        });

// Calculate averages
        Object.keys(endpoints).forEach(key => {
            if (endpoints[key].count > 0) {
                endpoints[key].averageTime = endpoints[key].totalTime / endpoints[key].count;
            }
        });

        return {
            totalCalls: apiCalls.length,
            endpoints: endpoints
        };
    }

    private ensureDirectoryExists(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Static helper to run a test with performance monitoring
     */
    static async runWithMonitoring<T>(
        browser: Browser,
        testName: string,
        testFn: (page: Page, monitor: PerformanceMonitor) => Promise<T>,
        config?: PerformanceMonitorConfig,
        thresholds?: PerformanceThresholds
    ): Promise<{ result: T; report: PerformanceReport | null }> {
        const monitor = new PerformanceMonitor({
            ...config,
            testName
        });

        if (thresholds) {
            monitor.setThresholds(thresholds);
        }

        const page = await monitor.createPage(browser);
        let result: T;

        try {
            result = await testFn(page, monitor);
        } finally {
            await monitor.close();
        }

        const report = await monitor.generateReport();

        return { result, report };
    }
}