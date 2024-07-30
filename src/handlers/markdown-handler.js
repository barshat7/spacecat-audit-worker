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

import path from 'path';
import AbstractHandler from './abstract-handler.js';

/**
 * Markdown handler, implements abstract handler with markdown processing.
 * @extends AbstractHandler
 */
class MarkdownHandler extends AbstractHandler {
  static handlerName = 'markdown';

  constructor(config, services) {
    super(
      MarkdownHandler.handlerName,
      config,
      services,
    );
    this.importPath = null;
  }

  /**
   * Check if the processing type is supported.
   * @param {string} processingType - Processing type.
   * @return {boolean} True if the processing type is supported.
   */
  static accepts(processingType) {
    return processingType === MarkdownHandler.handlerName;
  }

  async getStoragePath() {
    return path.join(`imports/${this.config.jobId}/markdown`, `${this.importPath}.md`);
  }

  // eslint-disable-next-line class-methods-use-this
  getStorageConfig() {
    return {
      contentType: 'text/markdown',
    };
  }

  // eslint-disable-next-line class-methods-use-this
  async transformScrapeResult(result) {
    const { textContent: md } = result.scrapeResult;

    this.importPath = new URL(result.finalUrl).pathname;
    return md;
  }
}

export default MarkdownHandler;
