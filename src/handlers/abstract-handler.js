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

import AWSXRay from 'aws-xray-sdk';
import {
  hasText, isBoolean, isNumber, isObject, isValidUrl,
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
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// eslint-disable-next-line import/no-extraneous-dependencies
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

import { promisify } from 'util';
import { exec } from 'child_process';

import fs from 'fs';
import path from 'path';

import { sendSlackMessage, sendSQSMessage } from '../support/utils.js';
import RedirectError from '../support/redirect-error.js';

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

/**
 * AbstractHandler class that serves as the base class for all specific handlers.
 * Provides common functionality for configuration validation, service validation,
 * logging, web scraping, and error handling.
 */
class AbstractHandler {
  /**
   * Creates an instance of AbstractHandler.
   * @param {string} handlerName - The name of the handler.
   * @param {Object} config - The configuration object for the handler.
   * @param {Object} config.jobId - The job ID.
   * @param {Object} config.s3BucketName - The S3 bucket name.
   * @param {Object} config.completionQueueUrl - The SQS completion queue URL.
   * @param {Object} config.slackContext - The Slack context object.
   * @param {Object} config.skipMessage - Whether to skip sending the completion message.
   * @param {Object} config.skipStorage - Whether to skip storing the scraped content.
   * @param {Object} config.device - The device to emulate.
   * @param {Object} services - The services required by the handler.
   * @param {Object} services.log - Logging service.
   * @param {Object} services.sqsClient - SQS client service.
   * @param {Object} services.s3Client - S3 client service.
   * @param {Object} services.slackClient - Slack client service.
   * @throws Will throw an error if the configuration or services are invalid.
   */
  constructor(handlerName, config, services) {
    this.handlerName = handlerName;
    this.config = config;
    this.services = services;

    this.#validateConfig();
    this.#validateServices();

    // Services
    this.log = services.log;
    this.sqsClient = services.sqsClient;
    this.s3Client = AWSXRay.captureAWSv3Client(services.s3Client);
    this.slackClient = services.slackClient;

    // Local
    this.device = config.device;
    this.browser = null;
    this.importPath = null;
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
   * @private
   * @param {string} level - The log level (e.g., 'info', 'error').
   * @param {string} message - The log message.
   * @param {Error} [error] - Optional error object to log.
   */
  #log(level, message, error) {
    const logMessage = `[${this.getName()}] ${message}`;
    if (error) {
      this.log[level](logMessage, error);
    } else {
      this.log[level](logMessage);
    }
  }

  /**
   * Gets the path to the script for evaluating the page.
   * @private
   * @returns {string} The path to the script.
   */
  #getScriptPath() {
    const defaultScriptPath = path.resolve('./static/evaluate/default.js');
    const handlerScriptPath = path.resolve(`./static/evaluate/${this.getName()}.js`);
    return fs.existsSync(handlerScriptPath) ? handlerScriptPath : defaultScriptPath;
  }

  /**
   * Gets the path to the script to inject in the page.
   * @private
   * @returns {string} The path to the script.
   */
  #getPageInjectCode() {
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
    const scriptPath = this.#getScriptPath();
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
      } : {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath('/opt/nodejs/node_modules/@sparticuz/chromium/bin'),
        headless: chromium.headless,
      };
      this.browser = await puppeteer.launch(options);

      this.#log('info', 'Browser Launched');
    }
    return this.browser;
  }

  #cleanupTmpFiles(browserProfileDir, tmpDir) {
    if (browserProfileDir) {
      fs.rmSync(browserProfileDir.split('=')[1], { recursive: true, force: true });
      this.#log('info', `Deleted browser profile directory: ${browserProfileDir}`);
    }
    const files = fs.readdirSync(tmpDir);
    files.forEach((file) => {
      if (file.startsWith('core.chromium.')) {
        const filePath = path.join(tmpDir, file);
        fs.rmSync(filePath, { force: true });
        this.#log('info', `Core dump file ${filePath} deleted successfully.`);
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
      this.#log('error', `Error closing browser: ${error.message}`, error);
      if (error.message === 'Close timeout' && browser?.process()) {
        this.#log('info', 'Killing browser process after close timeout');
        browser?.process().kill();
      } else {
        throw error;
      }
    }
    this.browser = null;
    // delete browser profile directory and all its contents
    this.#cleanupTmpFiles(browserProfileDir, '/tmp');
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
   * Scrapes the content from the given URL.
   * @private
   * @param {string} url - The URL to scrape.
   * @param {Object} options - The options for scraping.
   * @param {Number} retries - The number of retries.
   * @returns {Promise<Object>} The scrape result.
   * @throws Will throw an error if scraping fails.
   */
  async #scrape(url, customHeaders, options, retries = 0) {
    const maxRetries = 1;
    let browser = null;

    try {
      this.#log('info', `Scraping URL: ${url} with retries: ${retries}`);
      browser = await this.#getBrowser();
      const page = await browser.newPage();
      const startScrape = Date.now();
      const enableJavascript = isBoolean(options.enableJavascript)
        ? options.enableJavascript
        : true;
      const pageLoadTimeout = isNumber(options.pageLoadTimeout)
        ? options.pageLoadTimeout
        : 30000;

      if (!enableJavascript) {
        await page.setJavaScriptEnabled(false);
      }

      if (isObject(customHeaders)) {
        await page.setExtraHTTPHeaders(customHeaders);
      }

      if (this.device) {
        await page.emulate(this.device);
      }

      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: pageLoadTimeout,
      });

      this.validateResponseForUrl(url, response);

      await page.waitForSelector('body', { timeout: 10000 });

      const pageInjectCode = this.#getPageInjectCode();
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

      this.#log('info', `Time taken for scraping: ${scrapeTime}ms`);

      if (page && !page.isClosed()) {
        await page.close();
      }

      return {
        finalUrl: page.url(),
        scrapeResult,
        scrapeTime,
        scrapedAt: endScrape,
        userAgent: await browser.userAgent(),
      };
    } catch (e) {
      if (e instanceof RedirectError) {
        this.#log('info', `Caught redirect: ${e.message}`);
        throw e; // Re-throw the specific redirect error, we do not want to retry
      }
      if (retries >= maxRetries) {
        throw e;
      }
      this.#log('error', `Error scraping URL, retrying... ${e.message}`, e);

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
   * @returns {Promise<string>} The storage path.
   */
  // eslint-disable-next-line no-unused-vars
  async getStoragePath() {
    return path.join(`scrapes/${this.config.jobId}`, this.importPath ? `${this.importPath}/scrape.json` : 'scrape.json');
  }

  /**
   * Transforms the scrape result before storing it.
   * @param {Object} scrapeResult - The scrape result.
   * @return {Promise<*>} The transformed scrape result.
   */
  // eslint-disable-next-line class-methods-use-this
  async transformScrapeResult(scrapeResult) {
    return JSON.stringify(scrapeResult, null, 2);
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
   * @param {Object} options - The storage options.
   * @returns {Promise<string>} The S3 path where the content was stored or null if skipped.
   * @throws Will throw an error if storing fails.
   */
  // eslint-disable-next-line no-unused-vars
  async #store(content, options) {
    if (this.config.skipStorage) {
      this.#log('info', 'Skipping storage by config');
      return null;
    }

    const storageConfig = this.getStorageConfig();
    const filePath = await this.getStoragePath();

    const command = new PutObjectCommand({
      Bucket: this.config.s3BucketName,
      Key: filePath,
      Body: content,
      ContentType: storageConfig.contentType,
    });

    const response = await this.s3Client.send(command);

    this.#log('info', `Successfully uploaded to ${filePath}. Response: ${JSON.stringify(response)}`);

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
        this.#log('error', `Error getting disk usage: ${stderr}`);
      }
      this.#log('info', `Disk usage size (tmp): ${stdout}`);
    } catch (e) {
      this.#log('error', `Error getting disk usage: ${e.message}`, e);
    }
  }

  /**
   * Logs the start of the processing and sends a Slack message.
   * @private
   * @param {Array} urlsData - The array of URL data to process.
   */
  async onProcessingStart(urlsData) {
    this.#log('info', `Processing ${urlsData.length} URLs`);
    await sendSlackMessage(this.slackClient, this.config.slackContext, `Starting scrape of ${urlsData.length} URLs [${this.getName()}]`);
  }

  /**
   * Logs the completion of the processing and sends a completion message to SQS and Slack.
   * @private
   * @param {Array} results - The results of the processing.
   */
  async onProcessingComplete(results) {
    this.#log('info', `[${this.getName()}] Scrape complete. Scraped ${results.length} URLs. Failed to scrape ${results.filter((result) => result.error).length} URLs.`);

    if (this.config.skipMessage) {
      this.#log('info', 'Skipping completion message by config');
      return;
    }

    const completedMessage = {
      jobId: this.config.jobId,
      processingType: this.handlerName,
      slackContext: this.config.slackContext,
      scrapeResults: results.map((result) => {
        if (result.error) {
          const baseMetadata = {
            url: result.url,
            urlId: result.urlId,
            reason: result.error.message,
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
        return {
          location: result.location,
          metadata: {
            urlId: result.urlId,
            url: result.finalUrl,
            status: result.status || 'COMPLETE',
            path: result.scrapeResult.path,
          },
        };
      }),
    };

    await sendSQSMessage(this.sqsClient, this.config.completionQueueUrl, completedMessage);
    await sendSlackMessage(this.slackClient, this.config.slackContext, `Scrape complete. Scraped ${results.length} URLs. Failed to scrape ${results.filter((result) => result.error).length} URLs [${this.handlerName}]`);
  }

  /**
   * Processes the given URLs.
   * @param {Array} urlsData - The array of URL data to process.
   * @param {object} urlsData[] - The URL data object.
   * @param {string} urlsData[].url - The URL to process, required.
   * @param {string} [urlsData[].urlId] - Optional URL ID.
   * @param {string} [urlsData[].status] - Optional URL status.
   * @param {object} [options] - The processing options.
   * @param {boolean} [options.enableJavascript] - Whether to enable JavaScript in the browser,
   * default is true.
   * @param {int} [options.pageLoadTimeout] - The page load timeout in milliseconds,
   * default is 30000.
   * @returns {Promise<Array>} The results of the processing.
   * @throws Will throw an error if processing fails.
   */
  async process(urlsData, customHeaders, options = {}) {
    await this.onProcessingStart(urlsData);
    const results = [];
    for (const [index, urlData] of urlsData.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const result = await this.processUrl(urlData, customHeaders, options);
      results.push(result);
      this.#log('info', `Processed URL ${index + 1}/${urlsData.length}: ${urlData.url}`);
      // eslint-disable-next-line no-await-in-loop
      await this.getDiskUsage();
      this.#log('info', `Processed ${results.length} URLs...`);

      // wait for 1s before processing the next URL to avoid rate limiting
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }
    await this.onProcessingComplete(results);
    return results;
  }

  async processUrl(urlData, customHeaders, options = {}) {
    const { url } = urlData;

    if (!isValidUrl(url)) {
      this.#log('error', `Invalid URL: ${url}`);
      return { error: `Invalid URL: ${url}` };
    }

    this.importPath = new URL(url).pathname.replace(/\/$/, '');

    try {
      const result = await this.#scrape(url, customHeaders, options);
      const transformedResult = await this.transformScrapeResult(result);
      result.location = await this.#store(transformedResult, options);
      result.urlId = urlData.urlId;

      return result;
    } catch (e) {
      this.#log('error', `Failed to scrape URL: ${e.message}`, e);
      return { url, urlId: urlData.urlId, error: e };
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
