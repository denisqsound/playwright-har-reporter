import { Page, Locator, Browser, BrowserContext } from '@playwright/test';
import { PerformanceMonitor } from '../helpers/performance-monitor';
import { PerformanceConfig } from '../helpers/performance-config';

export interface PageOptions {
    storageState?: string | any;
    enableMonitoring?: boolean;
}

export class TestPage {
    public page: Page;
    public context: BrowserContext;
    protected performanceMonitor?: PerformanceMonitor;
    protected pageName: string = 'TestPage';

    protected constructor(page: Page, context: BrowserContext, enableMonitoring = false) {
        this.page = page;
        this.context = context;

        if (enableMonitoring) {
            const config = PerformanceConfig.getConfig();
            this.performanceMonitor = new PerformanceMonitor(config);
        }
    }

    /**
     * Factory method to create TestPage instance
     */
    static async create(browser: Browser, options: PageOptions = {}): Promise<TestPage> {
        let context: BrowserContext;
        let page: Page;

        if (options.enableMonitoring) {
            // Use PerformanceMonitor to create context with HAR recording
            const config = PerformanceConfig.getConfig();
            config.testName = 'TestPage';
            const monitor = new PerformanceMonitor(config);

            context = await monitor.createContext(browser, options.storageState);
            page = await context.newPage();

            const instance = new TestPage(page, context, true);
            instance.performanceMonitor = monitor;

            return instance;
        } else {
            // Normal context creation without monitoring
            const contextOptions: any = {};
            if (options.storageState) {
                contextOptions.storageState = options.storageState;
            }

            context = await browser.newContext(contextOptions);
            page = await context.newPage();

            return new TestPage(page, context, false);
        }
    }

    /**
     * Close the page and generate performance report if monitoring is enabled
     */
    async close() {
        let report = null;

        if (this.performanceMonitor) {
            // Close context which saves the HAR file
            await this.performanceMonitor.close();
            // Generate the performance report
            report = await this.performanceMonitor.generateReport();

            if (report) {
                console.log(`Performance report for ${this.pageName}:`, report.summary);
            }
        } else {
            await this.context.close();
        }

        return report;
    }

    /**
     * Navigate to a URL
     */
    async navigate(url: string) {
        await this.page.goto(url, { waitUntil: 'networkidle' });
    }

    /**
     * Wait for an element with timeout
     */
    async waitForElement(selector: string, timeout = 30000): Promise<Locator> {
        const element = this.page.locator(selector);
        await element.waitFor({ state: 'visible', timeout });
        return element;
    }

    /**
     * Click on element
     */
    async clickElement(selector: string) {
        const element = await this.waitForElement(selector);
        await element.click();
    }

    /**
     * Fill input field
     */
    async fillInput(selector: string, text: string) {
        const element = await this.waitForElement(selector);
        await element.fill(text);
    }

    /**
     * Get element text
     */
    async getElementText(selector: string): Promise<string> {
        const element = await this.waitForElement(selector);
        return await element.textContent() || '';
    }

    /**
     * Check if element is visible
     */
    async isElementVisible(selector: string): Promise<boolean> {
        try {
            const element = this.page.locator(selector);
            await element.waitFor({ state: 'visible', timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Wait for page load
     */
    async waitForPageLoad() {
        await this.page.waitForLoadState('networkidle');
    }

    /**
     * Get page title
     */
    async getPageTitle(): Promise<string> {
        return await this.page.title();
    }

    /**
     * Get page URL
     */
    getPageUrl(): string {
        return this.page.url();
    }
}