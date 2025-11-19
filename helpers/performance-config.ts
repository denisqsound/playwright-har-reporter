/// <reference types="node" />
import { PerformanceThresholds, PerformanceMonitorConfig } from './performance-monitor';

/**
 * Global configuration for performance monitoring
 */
export const PerformanceConfig = {
    // Base settings for all tests
    default: {
        harDir: 'test-results/har',
        reportDir: 'test-results/reports',
        recordHarMode: 'full',
        captureScreenshots: false
    } as PerformanceMonitorConfig,

    // Default threshold values
    thresholds: {
        default: {
            maxAverageResponseTime: 3000,  // 3 seconds
            maxFailedRequests: 0,
            maxTotalTime: 60000,           // 60 seconds total time
            maxRequestTime: 10000,         // 10 seconds per request
            maxPageLoadTime: 5000          // 5 seconds for page load
        } as PerformanceThresholds,

        strict: {
            maxAverageResponseTime: 1000,  // 1 second
            maxFailedRequests: 0,
            maxTotalTime: 30000,           // 30 seconds
            maxRequestTime: 3000,          // 3 seconds
            maxPageLoadTime: 2000          // 2 seconds
        } as PerformanceThresholds,

        relaxed: {
            maxAverageResponseTime: 5000,  // 5 seconds
            maxFailedRequests: 5,
            maxTotalTime: 120000,          // 2 minutes
            maxRequestTime: 15000,         // 15 seconds
            maxPageLoadTime: 10000         // 10 seconds
        } as PerformanceThresholds
    },

    // Configurations for different environments
    environments: {
        local: {
            harDir: 'test-results/local/har',
            reportDir: 'test-results/local/reports',
            recordHarMode: 'full'
        } as PerformanceMonitorConfig,

        staging: {
            harDir: 'test-results/staging/har',
            reportDir: 'test-results/staging/reports',
            recordHarMode: 'full',
            captureScreenshots: true
        } as PerformanceMonitorConfig,

        production: {
            harDir: 'test-results/production/har',
            reportDir: 'test-results/production/reports',
            recordHarMode: 'full',
            captureScreenshots: true,
            customMetrics: {
                environment: 'production',
                monitoringEnabled: true
            }
        } as PerformanceMonitorConfig
    },

    // Configurations for different test types
    testTypes: {
        smoke: {
            testName: 'smoke-test',
            recordHarMode: 'minimal'
        } as PerformanceMonitorConfig,

        regression: {
            testName: 'regression-test',
            recordHarMode: 'full',
            captureScreenshots: true
        } as PerformanceMonitorConfig,

        performance: {
            testName: 'performance-test',
            recordHarMode: 'full',
            captureScreenshots: false,
            customMetrics: {
                testType: 'performance',
                detailedMetrics: true
            }
        } as PerformanceMonitorConfig
    },

    // API endpoint patterns for categorization
    apiPatterns: {
        search: ['/api/search', '/search', '/find'],
        auth: ['/api/auth', '/login', '/logout', '/token'],
        data: ['/api/data', '/graphql', '/rest'],
        static: ['/static', '/assets', '/public']
    },

    // Function to get configuration based on environment
    getConfig(environment?: string, testType?: string):
        PerformanceMonitorConfig {
        const env = environment || process.env.TEST_ENV || 'local';
        const type = testType || process.env.TEST_TYPE || 'regression';

        return {
            ...this.default,
            ...this.environments[env as keyof typeof this.environments],
            ...this.testTypes[type as keyof typeof this.testTypes]
        };
    },

    // Function to get threshold values
    getThresholds(level?: 'default' | 'strict' | 'relaxed'): PerformanceThresholds {
        const envLevel = process.env.THRESHOLD_LEVEL;
        let thresholdLevel: 'default' | 'strict' | 'relaxed' = 'default';

        if (level) {
            thresholdLevel = level;
        } else if (envLevel && (envLevel === 'default' || envLevel ===
            'strict' || envLevel === 'relaxed')) {
            thresholdLevel = envLevel;
        }

        return this.thresholds[thresholdLevel];
    }
};

/**
 * Helper for creating a custom configuration
 */
export class PerformanceConfigBuilder {
    private config: PerformanceMonitorConfig = {};
    private thresholds: PerformanceThresholds = {};

    setTestName(name: string): this {
        this.config.testName = name;
        return this;
    }

    setDirectories(harDir: string, reportDir: string): this {
        this.config.harDir = harDir;
        this.config.reportDir = reportDir;
        return this;
    }

    setRecordMode(mode: 'full' | 'minimal'): this {
        this.config.recordHarMode = mode;
        return this;
    }

    enableScreenshots(): this {
        this.config.captureScreenshots = true;
        return this;
    }

    addCustomMetric(key: string, value: any): this {
        if (!this.config.customMetrics) {
            this.config.customMetrics = {};
        }
        this.config.customMetrics[key] = value;
        return this;
    }

    setThreshold(key: keyof PerformanceThresholds, value: number): this {
        this.thresholds[key] = value;
        return this;
    }

    build(): { config: PerformanceMonitorConfig; thresholds:
            PerformanceThresholds } {
        return {
            config: this.config,
            thresholds: this.thresholds
        };
    }
}

/**
 * Decorator for automatically adding performance monitoring to tests
 */
export function withPerformanceMonitoring(
    configOrBuilder?: PerformanceMonitorConfig | PerformanceConfigBuilder,
    thresholds?: PerformanceThresholds
) {
    return function(target: any, propertyKey: string, descriptor:
    PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(...args: any[]) {
            let config: PerformanceMonitorConfig;
            let thresh: PerformanceThresholds;

            if (configOrBuilder instanceof PerformanceConfigBuilder) {
                const built = configOrBuilder.build();
                config = built.config;
                thresh = built.thresholds;
            } else {
                config = configOrBuilder || PerformanceConfig.default;
                thresh = thresholds || PerformanceConfig.thresholds.default;
            }

            // Add monitoring logic here
            console.log(`Starting performance monitoring for ${propertyKey}`);
            const result = await originalMethod.apply(this, args);
            console.log(`Performance monitoring completed for ${propertyKey}`);

            return result;
        };

        return descriptor;
    };
}

// Export utilities for working with reports
export const ReportUtils = {
    /**
     * Compares two performance reports
     */
    compareReports(report1: any, report2: any): any {
        return {
            averageResponseTimeDiff:
                report2.summary.averageResponseTime -
                report1.summary.averageResponseTime,
            totalRequestsDiff: report2.summary.totalRequests -
                report1.summary.totalRequests,
            failedRequestsDiff: report2.summary.failedRequests -
                report1.summary.failedRequests,
            percentageImprovement: {
                responseTime: ((report1.summary.averageResponseTime -
                        report2.summary.averageResponseTime) /
                    report1.summary.averageResponseTime *
                    100).toFixed(2),
                failureRate: ((report1.summary.failedRequests -
                        report2.summary.failedRequests) /
                    Math.max(report1.summary.failedRequests,
                        1) * 100).toFixed(2)
            }
        };
    },

    /**
     * Aggregates multiple performance reports
     */
    aggregateReports(reports: any[]): any {
        const validReports = reports.filter(r => r && r.summary);

        if (validReports.length === 0) return null;

        const totalRequests = validReports.reduce((sum, r) => sum +
            r.summary.totalRequests, 0);
        const totalTime = validReports.reduce((sum, r) => sum +
            r.summary.totalTime, 0);
        const totalFailedRequests = validReports.reduce((sum, r) =>
            sum + r.summary.failedRequests, 0);

        return {
            reportCount: validReports.length,
            aggregate: {
                totalRequests,
                totalTime,
                totalFailedRequests,
                averageResponseTime: totalRequests > 0 ? totalTime /
                    totalRequests : 0,
                failureRate: totalRequests > 0 ? (totalFailedRequests
                    / totalRequests * 100).toFixed(2) : '0'
            },
            individual: validReports.map(r => ({
                testName: r.testName,
                duration: r.testDuration,
                requests: r.summary.totalRequests,
                avgTime: r.summary.averageResponseTime,
                failures: r.summary.failedRequests
            }))
        };
    },

    /**
     * Generates a summary report in Markdown format
     */
    generateMarkdownSummary(report: any): string {
        return `
# Performance Report: ${report.testName || 'Test'}

## Summary
- **Date**: ${report.timestamp}
- **Duration**: ${(report.testDuration / 1000).toFixed(2)}s
- **Total Requests**: ${report.summary.totalRequests}
- **Failed Requests**: ${report.summary.failedRequests}
- **Average Response Time**: ${report.summary.averageResponseTime.toFixed(0)}ms
- **Median Response Time**: ${report.summary.medianResponseTime.toFixed(0)}ms
- **95th Percentile**: ${report.summary.percentile95.toFixed(0)}ms

## Request Types
${Object.entries(report.requestTypes).map(([type, metrics]: [string, any]) =>
            `- **${type}**: ${metrics.count} requests,
${metrics.totalTime.toFixed(0)}ms total`
        ).join('\n')}

${report.performance.failedRequests.length > 0 ? `
## Failed Requests
${report.performance.failedRequests.map((r: any) =>
            `- ${r.method} ${r.url}: ${r.status} ${r.statusText}`
        ).join('\n')}
` : ''}

${report.thresholdViolations && report.thresholdViolations.length > 0 ? `
## Threshold Violations ⚠️
${report.thresholdViolations.map((v: any) =>
            `- **${v.message}**: Threshold=${v.threshold},
Actual=${v.actual.toFixed(2)}`
        ).join('\n')}
` : ''}
       `;
    }
};