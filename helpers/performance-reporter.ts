/// <reference types="node" />
// performance-reporter.ts
import { Reporter, TestCase, TestResult, FullResult, Suite } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { ReportUtils } from './performance-config';

export class PerformanceReporter implements Reporter {
    private performanceReports: Map<string, any> = new Map();
    private outputDir: string;
    private aggregateReport: any = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: {
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            performanceIssues: []
        }
    };

    constructor(options: { outputDir?: string } = {}) {
        this.outputDir = options.outputDir ||
            'test-results/performance-summary';

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    onBegin(config: any, suite: Suite): void {
        console.log('Performance monitoring started for',
            suite.allTests().length, 'tests');
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        this.aggregateReport.summary.totalTests++;

        if (result.status === 'passed') {
            this.aggregateReport.summary.passedTests++;
        } else if (result.status === 'failed') {
            this.aggregateReport.summary.failedTests++;
        }

        // Look for performance reports in test results
        const perfReportPath = this.findPerformanceReport(test, result);

        if (perfReportPath && fs.existsSync(perfReportPath)) {
            const report = JSON.parse(fs.readFileSync(perfReportPath, 'utf8'));
            this.performanceReports.set(test.title, report);

            // Add to aggregate report
            this.aggregateReport.tests.push({
                title: test.title,
                duration: result.duration,
                status: result.status,
                performance: {
                    totalRequests: report.summary?.totalRequests,
                    averageResponseTime: report.summary?.averageResponseTime,
                    failedRequests: report.summary?.failedRequests,
                    thresholdViolations: report.thresholdViolations
                }
            });

            // Check for performance issues
            if (report.thresholdViolations &&
                report.thresholdViolations.length > 0) {
                this.aggregateReport.summary.performanceIssues.push({
                    test: test.title,
                    violations: report.thresholdViolations
                });
            }
        }
    }

    async onEnd(result: FullResult): Promise<void> {
        // Generate aggregate performance report
        const reports = Array.from(this.performanceReports.values());

        if (reports.length > 0) {
            const aggregated = ReportUtils.aggregateReports(reports);

            // Save aggregate report
            const aggregatePath = path.join(this.outputDir,
                'aggregate-report.json');
            fs.writeFileSync(
                aggregatePath,
                JSON.stringify({
                    ...this.aggregateReport,
                    aggregateMetrics: aggregated
                }, null, 2)
            );

            // Generate HTML dashboard
            await this.generateDashboard(this.aggregateReport, aggregated);

            // Generate Markdown summary
            const markdownPath = path.join(this.outputDir,
                'PERFORMANCE_SUMMARY.md');
            fs.writeFileSync(markdownPath,
                this.generateMarkdownReport(aggregated));

            // Print summary to console
            this.printSummary(aggregated);
        }
    }

    private findPerformanceReport(test: TestCase, result: TestResult):
        string | null {
        // Try to find performance report in test-results
        const testName = test.title.replace(/[^a-zA-Z0-9]/g, '-');
        const possiblePaths = [
            path.join('test-results/reports', `report-${testName}-*.json`),
            path.join('test-results/reports', `report-*.json`),
            path.join(test.parent.title, 'performance-report.json')
        ];

        for (const pattern of possiblePaths) {
            const files = this.findFiles(pattern);
            if (files.length > 0) {
                // Return the most recent file
                return files.sort((a, b) =>
                    fs.statSync(b).mtime.getTime() -
                    fs.statSync(a).mtime.getTime()
                )[0];
            }
        }

        return null;
    }

    private findFiles(pattern: string): string[] {
        const dir = path.dirname(pattern);
        const filePattern = path.basename(pattern);

        if (!fs.existsSync(dir)) return [];

        const files = fs.readdirSync(dir);
        const regex = new RegExp(
            filePattern.replace(/\*/g, '.*').replace(/\?/g, '.')
        );

        return files
            .filter(f => regex.test(f))
            .map(f => path.join(dir, f));
    }

    private async generateDashboard(aggregate: any, metrics: any):
        Promise<void> {
        const html = `
<!DOCTYPE html>
<html>
<head>
   <title>Performance Test Dashboard</title>
   <meta charset="utf-8">
   <meta name="viewport" content="width=device-width, initial-scale=1">
   <style>
       * { margin: 0; padding: 0; box-sizing: border-box; }
       body {
           font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
           min-height: 100vh;
           padding: 20px;
       }
       .container { max-width: 1400px; margin: 0 auto; }
       .header {
           background: white;
           padding: 30px;
           border-radius: 10px;
           box-shadow: 0 10px 40px rgba(0,0,0,0.1);
           margin-bottom: 30px;
       }
       h1 { color: #333; margin-bottom: 10px; }
       .subtitle { color: #666; font-size: 14px; }
       .metrics-grid {
           display: grid;
           grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
           gap: 20px;
           margin-bottom: 30px;
       }
       .metric-card {
           background: white;
           padding: 20px;
           border-radius: 10px;
           box-shadow: 0 5px 20px rgba(0,0,0,0.1);
           transition: transform 0.3s ease;
       }
       .metric-card:hover { transform: translateY(-5px); }
       .metric-value {
           font-size: 36px;
           font-weight: bold;
           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
           -webkit-background-clip: text;
           -webkit-text-fill-color: transparent;
           margin: 10px 0;
       }
       .metric-label { color: #666; font-size: 14px; text-transform:
uppercase; }
       .tests-table {
           background: white;
           border-radius: 10px;
           padding: 20px;
           box-shadow: 0 5px 20px rgba(0,0,0,0.1);
           overflow-x: auto;
       }
       table {
           width: 100%;
           border-collapse: collapse;
       }
       th {
           background: #f7f8fc;
           padding: 12px;
           text-align: left;
           font-weight: 600;
           color: #666;
           border-bottom: 2px solid #e1e4e8;
       }
       td {
           padding: 12px;
           border-bottom: 1px solid #e1e4e8;
       }
       tr:hover { background: #f7f8fc; }
       .status-passed { color: #28a745; font-weight: 600; }
       .status-failed { color: #dc3545; font-weight: 600; }
       .status-skipped { color: #ffc107; font-weight: 600; }
       .performance-badge {
           display: inline-block;
           padding: 4px 8px;
           border-radius: 4px;
           font-size: 12px;
           font-weight: 600;
       }
       .performance-good { background: #d4edda; color: #155724; }
       .performance-warning { background: #fff3cd; color: #856404; }
       .performance-bad { background: #f8d7da; color: #721c24; }
       .violations {
           margin-top: 30px;
           padding: 20px;
           background: #fff5f5;
           border-radius: 10px;
           border-left: 4px solid #dc3545;
       }
       .chart-container {
           background: white;
           padding: 20px;
           border-radius: 10px;
           margin: 20px 0;
           box-shadow: 0 5px 20px rgba(0,0,0,0.1);
           height: 400px;
       }
       .no-data { text-align: center; color: #999; padding: 40px; }
   </style>
   <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
   <div class="container">
       <div class="header">
           <h1>🚀 Performance Test Dashboard</h1>
           <div class="subtitle">Generated: ${aggregate.timestamp}</div>
       </div>

       <div class="metrics-grid">
           <div class="metric-card">
               <div class="metric-label">Total Tests</div>
               <div class="metric-value">${aggregate.summary.totalTests}</div>
           </div>
           <div class="metric-card">
               <div class="metric-label">Passed</div>
               <div class="metric-value" style="color:
#28a745;">${aggregate.summary.passedTests}</div>
           </div>
           <div class="metric-card">
               <div class="metric-label">Failed</div>
               <div class="metric-value" style="color:
#dc3545;">${aggregate.summary.failedTests}</div>
           </div>
           <div class="metric-card">
               <div class="metric-label">Performance Issues</div>
               <div class="metric-value" style="color:
#ffc107;">${aggregate.summary.performanceIssues.length}</div>
           </div>
       </div>

       ${metrics ? `
       <div class="metrics-grid">
           <div class="metric-card">
               <div class="metric-label">Total Requests</div>
               <div
class="metric-value">${metrics.aggregate.totalRequests.toLocaleString()}</div>
           </div>
           <div class="metric-card">
               <div class="metric-label">Avg Response Time</div>
               <div
class="metric-value">${metrics.aggregate.averageResponseTime.toFixed(0)}ms</div>
           </div>
           <div class="metric-card">
               <div class="metric-label">Failed Requests</div>
               <div
class="metric-value">${metrics.aggregate.totalFailedRequests}</div>
           </div>
           <div class="metric-card">
               <div class="metric-label">Failure Rate</div>
               <div
class="metric-value">${metrics.aggregate.failureRate}%</div>
           </div>
       </div>
       ` : ''}

       <div class="chart-container">
           <canvas id="performanceChart"></canvas>
       </div>

       <div class="tests-table">
           <h2>Test Results</h2>
           <table>
               <thead>
                   <tr>
                       <th>Test Name</th>
                       <th>Status</th>
                       <th>Duration</th>
                       <th>Requests</th>
                       <th>Avg Response</th>
                       <th>Failed Reqs</th>
                       <th>Performance</th>
                   </tr>
               </thead>
               <tbody>
                   ${aggregate.tests.map((test: any) => `
                   <tr>
                       <td>${test.title}</td>
                       <td
class="status-${test.status}">${test.status.toUpperCase()}</td>
                       <td>${(test.duration / 1000).toFixed(2)}s</td>
                       <td>${test.performance?.totalRequests || '-'}</td>

<td>${test.performance?.averageResponseTime?.toFixed(0) || '-'}ms</td>
                       <td>${test.performance?.failedRequests || '-'}</td>
                       <td>
                           ${this.getPerformanceBadge(test.performance)}
                       </td>
                   </tr>
                   `).join('')}
               </tbody>
           </table>
       </div>

       ${aggregate.summary.performanceIssues.length > 0 ? `
       <div class="violations">
           <h2>⚠️ Performance Threshold Violations</h2>
           ${aggregate.summary.performanceIssues.map((issue: any) => `
               <div style="margin: 10px 0;">
                   <strong>${issue.test}</strong>
                   <ul style="margin-top: 5px; margin-left: 20px;">
                       ${issue.violations.map((v: any) => `
                           <li>${v.message} (Threshold:
${v.threshold}, Actual: ${v.actual})</li>
                       `).join('')}
                   </ul>
               </div>
           `).join('')}
       </div>
       ` : ''}
   </div>

   <script>
       // Performance chart
       const ctx =
document.getElementById('performanceChart').getContext('2d');
       const testData = ${JSON.stringify(aggregate.tests.map((t: any) => ({
            name: t.title,
            responseTime: t.performance?.averageResponseTime || 0
        })))};

       new Chart(ctx, {
           type: 'bar',
           data: {
               labels: testData.map(t => t.name.substring(0, 30) +
(t.name.length > 30 ? '...' : '')),
               datasets: [{
                   label: 'Average Response Time (ms)',
                   data: testData.map(t => t.responseTime),
                   backgroundColor: 'rgba(102, 126, 234, 0.5)',
                   borderColor: 'rgba(102, 126, 234, 1)',
                   borderWidth: 1
               }]
           },
           options: {
               responsive: true,
               maintainAspectRatio: false,
               scales: {
                   y: {
                       beginAtZero: true,
                       title: {
                           display: true,
                           text: 'Response Time (ms)'
                       }
                   }
               },
               plugins: {
                   title: {
                       display: true,
                       text: 'Performance Comparison Across Tests'
                   }
               }
           }
       });
   </script>
</body>
</html>
       `;

        const dashboardPath = path.join(this.outputDir, 'dashboard.html');
        fs.writeFileSync(dashboardPath, html);
        console.log(`\n📊 Performance dashboard generated: ${dashboardPath}`);
    }

    private getPerformanceBadge(performance: any): string {
        if (!performance) return '<span class="performance-badge">N/A</span>';

        const hasViolations = performance.thresholdViolations &&
            performance.thresholdViolations.length > 0;
        const avgTime = performance.averageResponseTime;

        if (hasViolations) {
            return '<span class="performance-badge performance-bad">ISSUES</span>';
        } else if (avgTime < 1000) {
            return '<span class="performance-badge performance-good">GOOD</span>';
        } else if (avgTime < 3000) {
            return '<span class="performance-badge performance-warning">OK</span>';
        } else {
            return '<span class="performance-badge performance-bad">SLOW</span>';
        }
    }

    private generateMarkdownReport(metrics: any): string {
        return `
# Performance Test Summary

## Overview
- **Total Reports**: ${metrics?.reportCount || 0}
- **Total Requests**: ${metrics?.aggregate.totalRequests || 0}
- **Average Response Time**:
${metrics?.aggregate.averageResponseTime?.toFixed(0) || 'N/A'}ms
- **Failed Requests**: ${metrics?.aggregate.totalFailedRequests || 0}
- **Failure Rate**: ${metrics?.aggregate.failureRate || '0'}%

## Individual Test Performance

| Test | Duration | Requests | Avg Time | Failures |
|------|----------|----------|----------|----------|
${metrics?.individual?.map((t: any) =>
            `| ${t.testName} | ${(t.duration / 1000).toFixed(2)}s | ${t.requests}
| ${t.avgTime.toFixed(0)}ms | ${t.failures} |`
        ).join('\n') || '| No data | - | - | - | - |'}

## Recommendations

${this.generateRecommendations(metrics)}

---
*Generated: ${new Date().toISOString()}*
       `;
    }

    private generateRecommendations(metrics: any): string {
        const recommendations = [];

        if (metrics?.aggregate.averageResponseTime > 3000) {
            recommendations.push('- ⚠️ High average response time detected. Consider optimizing API calls and reducing payload sizes.');
        }

        if (metrics?.aggregate.totalFailedRequests > 0) {
            recommendations.push(`- 🔴 ${metrics.aggregate.totalFailedRequests} failed requests detected. Investigate error logs for root cause.`);
        }

        if (metrics?.aggregate.failureRate > 5) {
            recommendations.push('- 📈 High failure rate. Check server capacity and error handling.');
        }

        if (recommendations.length === 0) {
            recommendations.push('- ✅ Performance metrics look good!');
        }

        return recommendations.join('\n');
    }

    private printSummary(metrics: any): void {
        console.log('\n' + '='.repeat(60));
        console.log('PERFORMANCE TEST SUMMARY');
        console.log('='.repeat(60));

        if (metrics) {
            console.log(`Total Requests: ${metrics.aggregate.totalRequests}`);
            console.log(`Average Response Time:
${metrics.aggregate.averageResponseTime.toFixed(0)}ms`);
            console.log(`Failed Requests:
${metrics.aggregate.totalFailedRequests}`);
            console.log(`Failure Rate: ${metrics.aggregate.failureRate}%`);
        } else {
            console.log('No performance data collected');
        }

        console.log('='.repeat(60) + '\n');
    }
}

// Playwright config integration
export default PerformanceReporter;