/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {
  hasText, isBoolean, isNumber, isObject, isValidUrl, isNonEmptyArray, isNonEmptyObject,
} from '@adobe/spacecat-shared-utils';
import { PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * The following dependencies are provided via AWS layers as externals
 * (see package.json wsk config).
 * Therefore, we have eslint ignore these dependencies.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import chromium from '@sparticuz/chromium';
// eslint-disable-next-line import/no-extraneous-dependencies
import puppeteer from 'puppeteer-extra';
// eslint-disable-next-line import/no-extraneous-dependencies
import { KnownDevices, PuppeteerError } from 'puppeteer-core';
// eslint-disable-next-line import/no-extraneous-dependencies
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// eslint-disable-next-line import/no-extraneous-dependencies
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

import { promisify } from 'util';
import { exec } from 'child_process';

import fs from 'fs';
import path from 'path';

import { takeScreenshots } from '../support/screenshot.js';
import { sendSlackMessage, sendSQSMessage } from '../support/utils.js';
import RedirectError from '../support/redirect-error.js';

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

chromium.setGraphicsMode = false;

export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Spacecat/1.0';

/**
 * AbstractHandler class that serves as the base class for all specific handlers.
 * Provides common functionality for configuration validation, service validation,
 * logging, web scraping, and error handling.
 */
class AbstractHandler {
  /**
   * The logging service that provides the log methods.
   */
  #logService;

  /**
   * Creates an instance of AbstractHandler.
   * @param {string} handlerName - The name of the handler.
   * @param {Object} config - The configuration object for the handler.
   * @param {Object} config.completionQueueUrl - The SQS completion queue URL.
   * @param {Object} config.device - The device to emulate.
   * @param {Object} config.jobId - The job ID.
   * @param {Object} config.s3BucketName - The S3 bucket name.
   * @param {Object} config.skipMessage - Whether to skip sending the completion message.
   * @param {Object} config.skipStorage - Whether to skip storing the scraped content.
   * @param {Object} config.slackContext - The Slack context object.
   * @param {Object} config.userAgent - The user agent to use.
   * @param {Object} services - The services required by the handler.
   * @param {Object} services.log - Logging service.
   * @param {Object} services.sqsClient - SQS client service.
   * @param {Object} services.s3Client - S3 client service.
   * @param {Object} services.slackClient - Slack client service.
   * @param {Object} services.xray - AWS X-Ray service.
   * @throws Will throw an error if the configuration or services are invalid.
   */
  constructor(handlerName, config, services) {
    this.handlerName = handlerName;
    this.config = config;
    this.services = services;

    this.#validateConfig();
    this.#validateServices();

    // Services
    this.#logService = services.log;
    this.sqsClient = services.sqsClient;
    this.s3Client = services.xray.captureAWSv3Client(services.s3Client);
    this.slackClient = services.slackClient;

    // Local
    this.device = config.device;
    this.browser = null;
    this.importPath = null;
    this.userAgent = config.userAgent || DEFAULT_USER_AGENT;
  }

  /**
   * Validates the handler configuration.
   * @private
   * @throws Will throw an error if the configuration is invalid.
   */
  #validateConfig() {
    if (!isObject(this.config)) {
      throw new Error('Invalid configuration: config should be an object');
    }
    const requiredFields = ['jobId'];
    if (!this.config.skipStorage) {
      requiredFields.push('s3BucketName');
    }
    if (!this.config.skipMessage) {
      requiredFields.push('completionQueueUrl');
    }
    requiredFields.forEach((field) => {
      if (!hasText(this.config[field])) {
        throw new Error(`Invalid configuration: ${field} is required`);
      }
    });

    if (!isObject(this.config.slackContext)) {
      throw new Error('Invalid configuration: slackContext should be an object');
    }
  }

  /**
   * Validates the provided services.
   * @private
   * @throws Will throw an error if the required services are not provided.
   */
  #validateServices() {
    const requiredServices = ['log', 'sqsClient', 's3Client'];
    requiredServices.forEach((service) => {
      if (!this.services[service]) {
        throw new Error(`Invalid services: ${service} is required`);
      }
    });
  }

  /**
   * Centralized logging method that includes the handler name.
   * @param {string} level - The log level (e.g., 'info', 'error').
   * @param {string} message - The log message.
   * @param {Error} [error] - Optional error object to log.
   */
  log(level, message, error) {
    const logMessage = `[${this.getName()}] ${message}`;
    if (error) {
      this.#logService[level](logMessage, error);
    } else {
      this.#logService[level](logMessage);
    }
  }

  /**
   * Gets the path to the script for evaluating the page.
   * @returns {string} The path to the script.
   */
  // eslint-disable-next-line class-methods-use-this
  getScriptPath() {
    return path.resolve('./static/evaluate/default.js');
  }

  /**
   * Gets the path to the script to inject in the page. Different handlers may have different
   * scripts for their use case.
   * @returns {string} The path to the script.
   */
  getPageInjectCode() {
    const handlerScriptPath = path.resolve(`./static/inject/${this.getName()}.js`);
    if (fs.existsSync(handlerScriptPath)) {
      return fs.readFileSync(handlerScriptPath, 'utf8');
    }
    return null;
  }

  /**
   * Gets the code for evaluating on the page in the browser context.
   * The function is read from a script file.
   * @private
   * @return {string}
   */
  #getPageEvalCode() {
    const scriptPath = this.getScriptPath();
    return fs.readFileSync(scriptPath, 'utf8');
  }

  /**
   * Gets the browser instance, launching it if necessary.
   * @private
   * @returns {Promise<Object>} The browser instance.
   */
  async #getBrowser() {
    if (!this.browser) {
      const isLocal = process.env.AWS_EXECUTION_ENV === undefined;
      const options = isLocal ? {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: '/opt/homebrew/bin/chromium',
        headless: true,
        ignoreHTTPSErrors: true,
      } : {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath('/opt/nodejs/node_modules/@sparticuz/chromium/bin'),
        headless: chromium.headless,
      };
      this.browser = await puppeteer.launch(options);

      this.log('info', 'Browser Launched');
    }
    return this.browser;
  }

  #cleanupTmpFiles(browserProfileDir, tmpDir) {
    if (browserProfileDir) {
      fs.rmSync(browserProfileDir.split('=')[1], { recursive: true, force: true });
      this.log('info', `Deleted browser profile directory: ${browserProfileDir}`);
    }
    const files = fs.readdirSync(tmpDir);
    files.forEach((file) => {
      if (file.startsWith('core.chromium.')) {
        const filePath = path.join(tmpDir, file);
        fs.rmSync(filePath, { force: true });
        this.log('info', `Core dump file ${filePath} deleted successfully.`);
      }
    });
  }

  async #closeBrowser(browser) {
    const browserProfileDir = browser?.process().spawnargs.find((arg) => arg.includes('--user-data-dir='));
    try {
      // set a timeout to close the browser
      await Promise.race([
        browser?.close(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Close timeout')), 3000);
        }),
      ]);
    } catch (error) {
      this.log('error', `Error closing browser: ${error.message}`, error);
      if (error.message === 'Close timeout' && browser?.process()) {
        this.log('info', 'Killing browser process after close timeout');
        browser?.process().kill();
      } else {
        throw error;
      }
    }
    this.browser = null;
    // delete browser profile directory and all its contents
    this.#cleanupTmpFiles(browserProfileDir, '/tmp');
  }

  async #closePage(page) {
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (e) {
      this.log('error', `Error closing page: ${e.message}`, e);
    }
  }

  async #closeAllPages() {
    const pages = await this.browser.pages();
    await Promise.all(pages.map((page) => this.#closePage(page)));
  }

  /**
   * Gets the name of the handler.
   * @return {string} The handler name.
   */
  getName() {
    return this.handlerName;
  }

  /**
   * Extension point to validate the response.
   * @param {string} originalUrl - The original URL.
   * @param {Object} response - The response object.
   */
  // eslint-disable-next-line class-methods-use-this,no-unused-vars
  validateResponseForUrl(originalUrl, response) {
    // No-op in the abstract implementation
  }

  /**
   * Checks for redirects and throws an error for the same.
   * @param {string} originalUrl
   * @param {*} response
   */
  // eslint-disable-next-line class-methods-use-this
  checkForRedirect(originalUrl, response) {
    const redirectChain = response?.request()?.redirectChain();
    const isRedirected = redirectChain && redirectChain.length > 0;
    const isUrlChanged = response?.url() !== originalUrl;

    if (isRedirected && isUrlChanged) {
      throw new RedirectError(`Redirected to ${response.url()} from ${originalUrl}`);
    }
  }

  /**
   * Scrapes the content from the given URL.
   * @private
   * @param {string} url - The URL to scrape.
   * @param {Object} customHeaders - The custom headers to use.
   * @param {Object} options - The options for scraping.
   * @param {Number} retries - The number of retries.
   * @returns {Promise<Object>} The scrape result.
   * @throws Will throw an error if scraping fails.
   */
  async #scrape(url, customHeaders, options, retries = 0) {
    const maxRetries = 1;
    let browser = null;
    let page = null;

    try {
      this.log('info', `Scraping URL: ${url} with retries: ${retries}`);
      browser = await this.#getBrowser();
      page = await browser.newPage();
      await page.setUserAgent(this.userAgent);
      const startScrape = Date.now();
      const enableJavascript = isBoolean(options.enableJavascript)
        ? options.enableJavascript
        : true;
      const pageLoadTimeout = isNumber(options.pageLoadTimeout)
        ? options.pageLoadTimeout
        : 30000;
      const { screenshotTypes } = options;
      const devices = [];
      if (isNonEmptyArray(screenshotTypes) && !this.config.skipStorage) {
        // Add mobile and desktop viewports for screenshots
        devices.push('iPhone 6', 'desktop');
      }

      // Add additional viewport if requested and not already added
      if (this.device && !devices.includes(this.device) && this.device in KnownDevices) {
        devices.push(this.device);
      }

      // Fallback to desktop if no device is selected
      if (devices.length === 0) {
        devices.push('desktop');
      }
      this.log('info', `Scraping URL: ${url} for devices: ${devices.join(', ')}`);

      const screenshots = [];

      if (!enableJavascript) {
        await page.setJavaScriptEnabled(false);
      }

      if (isNonEmptyObject(customHeaders)) {
        this.log('debug', `Setting custom headers: ${JSON.stringify(customHeaders, null, 2)}`);

        // lower case all header keys then check for user agent
        const userAgent = Object.keys(customHeaders).find((key) => key.toLowerCase() === 'user-agent');

        // if the user has specifically set a user agent, use that
        if (hasText(userAgent)) {
          this.userAgent = customHeaders[userAgent];
        }

        await page.setExtraHTTPHeaders(customHeaders);
      }
      // Do screenshots for all devices
      /* eslint-disable no-await-in-loop */
      let device;
      let response;
      for (device of devices) {
        const knownDevice = KnownDevices[device];

        // Set user agent
        const userAgent = device !== 'desktop' ? knownDevice.userAgent : this.userAgent;
        await page.setUserAgent(userAgent);

        // Set viewport
        const viewport = device === 'desktop' ? chromium.defaultViewport : knownDevice.viewport;
        await page.setViewport({
          ...viewport,
          // Keep this at 1 as puppeteer fullPage screenshots do not work with higher scaling
          deviceScaleFactor: 1,
        });

        // Wait for page loaded
        response = await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: pageLoadTimeout,
        });

        this.validateResponseForUrl(url, response);

        const selectorToWait = hasText(options.waitForSelector) ? options.waitForSelector : 'body';
        await page.waitForSelector(selectorToWait, { timeout: 10000 });

        // Take screenshot
        if (isNonEmptyArray(screenshotTypes) && !this.config.skipStorage) {
          screenshots.push(...await takeScreenshots(
            this.services,
            page,
            device,
            options,
          ));
        }
      }

      if (options?.rejectRedirects === true) {
        this.checkForRedirect(url, response);
      }

      const pageInjectCode = this.getPageInjectCode();
      if (hasText(pageInjectCode)) {
        await page.evaluate(pageInjectCode);
      }

      // Inject and evaluate custom code, as provided by the handler implementation
      const customInjectCode = await this.getCustomInjectCode();
      if (hasText(customInjectCode)) {
        await page.evaluate(customInjectCode);
      }

      const pageEvalCode = this.#getPageEvalCode();
      const scrapeResult = await page.evaluate(pageEvalCode);
      const endScrape = Date.now();
      const scrapeTime = endScrape - startScrape;

      await this.#closeAllPages();

      this.log('info', `Time taken for scraping: ${scrapeTime}ms`);

      return {
        finalUrl: page.url(),
        scrapeResult,
        screenshots,
        scrapeTime,
        scrapedAt: endScrape,
        userAgent: await browser.userAgent(),
        device,
      };
    } catch (e) {
      await this.#closeAllPages();

      if (e instanceof RedirectError) {
        this.log('info', `Caught redirect: ${e.message}`);
        throw e; // Re-throw the specific redirect error, we do not want to retry
      }
      if (e instanceof PuppeteerError) {
        this.log('error', `Puppeteer error: ${e.message}`, e);
        throw e;
      }
      if (e.message?.startsWith('net::')) {
        this.log('error', `Network error: ${e.message}`, e);
        throw e;
      }
      if (retries >= maxRetries) {
        throw e;
      }
      this.log('error', `Error scraping URL, retrying... ${e.message}`, e);

      await this.#closeBrowser(browser);

      // Retry after 1 second
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      return this.#scrape(url, customHeaders, options, retries + 1);
    }
  }

  /**
   * Gets a string of any custom code which should be injected into the browser to assist with
   * scraping. Returning null is acceptable in the case where there is no code to inject.
   * @returns {Promise<string|null>} The custom JavaScript code.
   */
  // eslint-disable-next-line class-methods-use-this
  async getCustomInjectCode() {
    // No-op in the abstract implementation
    return null;
  }

  /**
   * Gets the storage path for the scraped content.
   * @param {string} fileName - The name of the file.
   * @param {string} [prefix = ''] - The prefix for the storage path.
   * @returns {Promise<string>} The storage path.
   */
  // eslint-disable-next-line no-unused-vars
  async getStoragePath(fileName, prefix = '') {
    return path.join(`scrapes/${this.config.jobId}`, this.importPath || '', prefix || '', fileName);
  }

  /**
   * Transforms the scrape result before storing it.
   * @param {Object} scrapeResult - The scrape result.
   * @return {Promise<*>} The transformed scrape result.
   */
  // eslint-disable-next-line class-methods-use-this
  async transformScrapeResult(scrapeResult) {
    const transformedResult = { ...scrapeResult };
    // Remove binary from screenshots object
    transformedResult.screenshots = transformedResult.screenshots.map((screenshot) => {
      // eslint-disable-next-line no-unused-vars
      const { binary, ...rest } = screenshot;
      return rest;
    });

    return JSON.stringify(transformedResult, null, 2);
  }

  /**
   * Gets the storage configuration for the scraped content.
   * @return {{contentType: string}}
   */
  // eslint-disable-next-line class-methods-use-this
  getStorageConfig() {
    return {
      contentType: 'application/json',
    };
  }

  /**
   * Stores the scraped content in S3.
   * @private
   * @param {Object} content - The content to store.
   * @param {Array} screenshots - Any additional files to store.
   * @param {Object} options - The storage options.
   * @returns {Promise<string>} The S3 path where the content was stored or null if skipped.
   * @throws Will throw an error if storing fails.
   */
  // eslint-disable-next-line no-unused-vars
  async #store(content, screenshots, options) {
    if (this.config.skipStorage) {
      this.log('info', 'Skipping storage by config');
      return null;
    }

    const commands = [];
    const { storagePrefix = '' } = options;

    for (const screenshot of screenshots) {
      const {
        folder = '', fileName, binary, contentType,
      } = screenshot;
      this.log('info', `Storing screenshot ${fileName} in folder ${folder}`);
      const prefix = hasText(storagePrefix) ? `${storagePrefix}/${folder}` : folder;
      const storagePath = await this.getStoragePath(fileName, prefix);
      commands.push(new PutObjectCommand({
        Bucket: this.config.s3BucketName,
        Key: storagePath,
        Body: binary,
        ContentType: contentType,
      }));
    }

    const storageConfig = this.getStorageConfig();

    const filePath = await this.getStoragePath('scrape.json', storagePrefix);
    commands.push(new PutObjectCommand({
      Bucket: this.config.s3BucketName,
      Key: filePath,
      Body: content,
      ContentType: storageConfig.contentType,
    }));

    const responses = await Promise.all(commands.map((command) => this.s3Client.send(command)));
    const lastResponse = responses[responses.length - 1];
    this.log('info', `Successfully uploaded to ${filePath}. Response: ${JSON.stringify(lastResponse)}`);

    return filePath;
  }

  /**
   * Wraps the promisify function around the exec function.
   * @type {(arg1: string) => Promise<string>}
   */
  execPromise = promisify(exec);

  /**
   * Gets the disk usage of the /tmp directory.
   * @returns {Promise<void>}
   */
  async getDiskUsage() {
    try {
      const { stdout, stderr } = await this.execPromise('df -P -H /tmp');
      if (stderr) {
        this.log('error', `Error getting disk usage: ${stderr}`);
      }
      this.log('info', `Disk usage size (tmp): ${stdout}`);
    } catch (e) {
      this.log('error', `Error getting disk usage: ${e.message}`, e);
    }
  }

  /**
   * Logs the start of the processing and sends a Slack message.
   * @private
   * @param {Array} urlsData - The array of URL data to process.
   */
  async onProcessingStart(urlsData) {
    this.log('info', `Processing ${urlsData.length} URLs`);
    await sendSlackMessage(this.slackClient, this.config.slackContext, `Starting scrape of ${urlsData.length} URLs [${this.getName()}]`);
  }

  /**
   * Creates the completion message after the processing.
   * @param results
   * @returns {object}
   */
  createCompletionMessage(results) {
    const completedMessage = {
      jobId: this.config.jobId,
      processingType: this.handlerName,
      slackContext: this.config.slackContext,
      scrapeResults: results.map((result) => {
        if (result.error) {
          // Handle error case
          const baseMetadata = {
            url: result.url,
            urlId: result.urlId,
            reason: result.error.message,
            jobMetadata: result.jobMetadata,
          };
          if (result.error instanceof RedirectError) {
            return {
              metadata: {
                ...baseMetadata,
                status: 'REDIRECT',
              },
            };
          }

          return {
            metadata: {
              ...baseMetadata,
              status: 'FAILED',
            },
          };
        }
        // Handle successful scrape
        return {
          location: result.location,
          metadata: {
            urlId: result.urlId,
            url: result.finalUrl,
            status: result.status || 'COMPLETE',
            path: result.scrapeResult.path,
            jobMetadata: result.jobMetadata,
          },
        };
      }),
    };

    return completedMessage;
  }

  /**
   * Logs the completion of the processing and sends a completion message to SQS and Slack.
   * @private
   * @param {Array} results - The results of the processing.
   */
  async onProcessingComplete(results) {
    this.log('info', `[${this.getName()}] Scrape complete. Scraped ${results.length} URLs. Failed to scrape ${results.filter((result) => result.error).length} URLs.`);

    if (this.config.skipMessage) {
      this.log('info', 'Skipping completion message by config');
      return;
    }

    const completedMessage = await this.createCompletionMessage(results);
    this.log('info', `Sending completion message to sqs :  ${this.config.completionQueueUrl}`);

    await sendSQSMessage(
      this.sqsClient,
      this.config.completionQueueUrl,
      completedMessage,
      this.config.jobId,
    );
    await sendSlackMessage(this.slackClient, this.config.slackContext, `Scrape complete. Scraped ${results.length} URLs. Failed to scrape ${results.filter((result) => result.error).length} URLs [${this.handlerName}]`);
  }

  /**
   * Processes the given URLs.
   * @param {Array} urlsData - The array of URL data to process.
   * @param {object} urlsData[] - The URL data object.
   * @param {string} urlsData[].url - The URL to process, required.
   * @param {string} [urlsData[].urlId] - Optional URL ID.
   * @param {string} [urlsData[].status] - Optional URL status.
   * @param {object} [customHeaders] - The custom headers to use for the processing.
   * @param {object} [options] - The processing options.
   * @param {boolean} [options.enableJavascript] - Whether to enable JavaScript in the browser,
   * default is true.
   * @param {int} [options.pageLoadTimeout] - The page load timeout in milliseconds,
   * default is 30000.
   * @param {boolean} [options.screenshotTypes] - Configuration for the screenshot types to take
   * @returns {Promise<Array>} The results of the processing.
   * @throws Will throw an error if processing fails.
   */
  async process(urlsData, customHeaders, options = {}) {
    await this.onProcessingStart(urlsData);
    const results = [];
    const totalUrls = urlsData.length;

    function hasAnotherUrlToProcess(index) {
      return (index + 1) < totalUrls;
    }

    try {
      for (const [index, urlData] of urlsData.entries()) {
        // eslint-disable-next-line no-await-in-loop
        const result = await this.processUrl(urlData, customHeaders, options);
        results.push(result);
        this.log(
          'info',
          `Processed URL ${index + 1}/${urlsData.length}: ${urlData.url}`,
        );
        // eslint-disable-next-line no-await-in-loop
        await this.getDiskUsage();
        this.log('info', `Processed ${results.length} URLs...`);

        // Only wait if we have another URL to process
        if (hasAnotherUrlToProcess(index)) {
          // wait for 1s before processing the next URL to avoid rate limiting
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, 1000);
          });
        }
      }
    } finally {
      if (this.browser) {
        await this.#closeBrowser(this.browser);
      }
    }

    await this.onProcessingComplete(results);
    return results;
  }

  async processUrl(urlData, customHeaders, options = {}) {
    const { url } = urlData;

    if (!isValidUrl(url)) {
      this.log('error', `Invalid URL: ${url}`);
      return { error: `Invalid URL: ${url}` };
    }

    this.importPath = new URL(url).pathname.replace(/\/$/, '');

    const jobMetadata = isObject(urlData.jobMetadata) ? { ...urlData.jobMetadata } : {};

    try {
      const result = await this.#scrape(url, customHeaders, options);
      const transformedResult = await this.transformScrapeResult(result);
      result.location = await this.#store(transformedResult, result.screenshots, options);
      result.urlId = urlData.urlId;
      result.jobMetadata = jobMetadata;

      return result;
    } catch (e) {
      this.log('error', `Failed to scrape URL: ${e.message}`, e);
      return {
        url, urlId: urlData.urlId, jobMetadata, error: e,
      };
    }
  }

  /**
   * Determines if the handler can process the given processing type.
   * @static
   * @param {string} processingType - The type of processing.
   * @throws Will throw an error if the method is not implemented in a subclass.
   * @returns {boolean} Whether the handler can process the given processing type.
   */
  // eslint-disable-next-line no-unused-vars
  static accepts(processingType) {
    throw new Error('accepts method not implemented');
  }
}

export default AbstractHandler;
