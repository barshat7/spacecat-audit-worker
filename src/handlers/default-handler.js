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

import AbstractHandler from './abstract-handler.js';

/**
 * Default handler, implements abstract handler with no adjustments.
 * @extends AbstractHandler
 */
class DefaultHandler extends AbstractHandler {
  static handlerName = 'default';

  constructor(config, services) {
    super(
      DefaultHandler.handlerName,
      config,
      services,
    );
  }

  /**
   * Check if the processing type is supported.
   * @param {string} processingType - Processing type.
   * @return {boolean} True if the processing type is supported.
   */
  static accepts(processingType) {
    return processingType === DefaultHandler.handlerName;
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
   * @param {boolean} [options.takeScreenshot] - Take a screenshot of the page,
   * default is true.
   * @param {boolean} [options.generateThumbnail] - Generate a thumbnail from the screenshot,
   * default is true.
   * @returns {Promise<Array>} The results of the processing.
   * @throws Will throw an error if processing fails.
   */
  async process(urlsData, customHeaders, options = {}) {
    const defaultOptions = {
      takeScreenshot: true,
      generateThumbnail: true,
      ...options,
    };

    return super.process(urlsData, customHeaders, defaultOptions);
  }
}

export default DefaultHandler;
