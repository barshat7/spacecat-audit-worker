/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import path from 'path';
import AbstractHandler from './abstract-handler.js';
import { SCREENSHOT_TYPES } from '../support/screenshot.js';

/**
 * Handler for Form URLs.
 */

class FormHandler extends AbstractHandler {
  static handlerName = 'form';

  constructor(config, services) {
    super(
      FormHandler.handlerName,
      config,
      services,
    );
    this.services.log.info(`Form handler initialized with config: ${JSON.stringify(config, null, 2)}`);
  }

  /**
   * Check if the form processing type is supported.
   * @param processingType
   * @returns {boolean}
   */
  static accepts(processingType) {
    return processingType === FormHandler.handlerName;
  }

  /**
   * Processes the given URLs with customized screenshot types options for forms
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
    const defaultOptions = {
      screenshotTypes: [
        SCREENSHOT_TYPES.FULL_PAGE,
        SCREENSHOT_TYPES.THUMBNAIL,
      ],
      storagePrefix: 'forms',
      ...options,
    };

    return super.process(urlsData, customHeaders, defaultOptions);
  }

  createCompletionMessage(results) {
    const baseMessage = super.createCompletionMessage(results);
    const finalMessage = {
      ...baseMessage,
      type: 'forms-opportunities',
      siteId: this.config.siteId,
      auditContext: this.config.auditContext,
    };
    this.services.log.info(`Form handler completion message: ${JSON.stringify(finalMessage, null, 2)}`);
    return finalMessage;
  }

  // eslint-disable-next-line class-methods-use-this
  getScriptPath() {
    return path.resolve('./static/evaluate/form.js');
  }
}

export default FormHandler;
