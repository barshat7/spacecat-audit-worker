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
  hasText,
  isBoolean,
  isNumber,
  isObject,
  isValidUrl,
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

import fs from 'fs';
import path from 'path';

import { sendSlackMessage } from '../support/utils.js';

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
    this.s3Client = services.s3Client;
    this.slackClient = services.slackClient;

    // Local
    this.browser = null;
    this.device = config.device;
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
    const requiredFields = ['jobId', 's3BucketName', 'completionQueueUrl'];
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
    const logMessage = `[${this.handlerName}] ${message}`;
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
    const handlerScriptPath = path.resolve(`./static/evaluate/${this.handlerName}.js`);
    return fs.existsSync(handlerScriptPath) ? handlerScriptPath : defaultScriptPath;
  }

  /**
   * Gets the path to the script to inject in the page.
   * @private
   * @returns {string} The path to the script.
   */
  #getPageInjectCode() {
    const handlerScriptPath = path.resolve(`./static/inject/${this.handlerName}.js`);
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
    }

    this.#log('info', 'Browser Launched');

    return this.browser;
  }

  /**
   * Scrapes the content from the given URL.
   * @private
   * @param {string} url - The URL to scrape.
   * @param {Object} options - The options for scraping.
   * @returns {Promise<Object>} The scrape result.
   * @throws Will throw an error if scraping fails.
   */
  async #scrape(url, options) {
    const startScrape = Date.now();
    const browser = await this.#getBrowser();

    try {
      const page = await browser.newPage();
      const enableJavascript = isBoolean(options.enableJavascript)
        ? options.enableJavascript
        : true;
      const pageLoadTimeout = isNumber(options.pageLoadTimeout)
        ? options.pageLoadTimeout
        : 30000;

      if (!enableJavascript) {
        await page.setJavaScriptEnabled(false);
      }

      if (this.device) {
        await page.emulate(this.device);
      }

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: pageLoadTimeout,
      });

      await page.waitForSelector('body', { timeout: 10000 });

      this.#log('info', `Page Loaded: ${url}`);

      // Inject the script into the page
      const pageInjectCode = this.#getPageInjectCode();
      if (hasText(pageInjectCode)) {
        await page.evaluate(pageInjectCode);
      }

      // The code is executed in the browser context
      const pageEvalCode = this.#getPageEvalCode();
      const scrapeResult = await page.evaluate(pageEvalCode);

      await page.close();

      const endScrape = Date.now();
      const scrapeTime = endScrape - startScrape;

      this.#log('info', `Time taken for scraping: ${scrapeTime}ms`);

      return {
        finalUrl: page.url(),
        scrapeResult,
        scrapeTime,
        scrapedAt: endScrape,
        userAgent: await browser.userAgent(),
      };
    } finally {
      browser.close();
    }
  }

  /**
   * Gets the storage path for the scraped content.
   * @returns {Promise<string>} The storage path.
   */
  async getStoragePath() {
    return `scrapes/${this.config.jobId}/scrape.json`;
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
   * @returns {Promise<string>} The S3 path where the content was stored.
   * @throws Will throw an error if storing fails.
   */
  // eslint-disable-next-line no-unused-vars
  async #store(content, options) {
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
   * Handles processing errors.
   * @private
   * @param {Error} e - The error that occurred.
   */
  async #onProcessingError(e) {
    this.#log('error', 'Failed to process', e);
    await sendSlackMessage(this.slackClient, this.config.slackContext, `Failed to process with error: ${e} [${this.handlerName}]`);
  }

  /**
   * Logs the start of the processing and sends a Slack message.
   * @private
   * @param {string} url - The URL being processed.
   */
  async #onProcessingStart(url) {
    this.#log('info', `Processing URL: ${url}`);
    await sendSlackMessage(this.slackClient, this.config.slackContext, `Starting scrape of URL: ${url} [${this.handlerName}]`);
  }

  /**
   * Logs the completion of the processing and sends a completion message to SQS and Slack.
   * @private
   * @param {Object} result - The result of the processing.
   */
  async #onProcessingComplete(result, urlData) {
    this.#log('info', `Scrape complete. Result: ${JSON.stringify(result)}`);

    const completedMessage = {
      jobId: this.config.jobId,
      processingType: this.handlerName,
      slackContext: this.config.slackContext,
      scrapeResults: [{
        location: result.location,
        metadata: {
          urlId: urlData.urlId,
          url: result.finalUrl,
          status: result.status || 'COMPLETE',
          path: result.scrapeResult.path,
          file: `${result.scrapeResult.path}.docx`,
        },
      }],
    };

    await this.sqsClient.sendMessage(this.config.completionQueueUrl, completedMessage);
    await sendSlackMessage(this.slackClient, this.config.slackContext, `Scrape complete for ${result.finalUrl} [${this.handlerName}]`);
  }

  /**
   * Processes the given URL.
   * @param {object} urlData - The URL data to process.
   * @param {string} urlData.url - The URL to process, required.
   * @param {string} [urlData.urlId] - Optional URL ID.
   * @param {string} [urlData.status] - Optional URL status.
   * @param {object} [options] - The processing options.
   * @param {boolean} [options.enableJavascript] - Whether to enable JavaScript in the browser,
   * default is true.
   * @param {int} [options.pageLoadTimeout] - The page load timeout in milliseconds,
   * default is 30000.
   * @returns {Promise<Object>} The result of the processing.
   * @throws Will throw an error if processing fails.
   */
  async process(urlData, options = {}) {
    const { url } = urlData;

    if (!isValidUrl(url)) {
      throw new Error('Invalid URL');
    }

    try {
      await this.#onProcessingStart(url);

      const result = await this.#scrape(url, options);
      const transformedResult = await this.transformScrapeResult(result);
      result.location = await this.#store(transformedResult, options);

      await this.#onProcessingComplete(result, urlData);

      return result;
    } catch (e) {
      await this.#onProcessingError(e);
      throw e;
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
