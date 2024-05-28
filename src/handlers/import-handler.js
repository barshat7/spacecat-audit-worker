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
 * Handler for import as a service URLs.
 */
class ImportHandler extends AbstractHandler {
  static handlerName = 'import';

  constructor(config, services) {
    super(
      ImportHandler.handlerName,
      config,
      services,
    );
  }

  async getStoragePath() {
    // todo: implement the storage path for docx
    return super.getStoragePath();
  }

  async transformScrapeResult(scrapeResult) {
    // todo: implement the transformation to docx
    return super.transformScrapeResult(scrapeResult);
  }

  // eslint-disable-next-line class-methods-use-this
  getStorageConfig() {
    return {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
    };
  }

  static accepts(processingType) {
    return processingType === ImportHandler.handlerName;
  }
}

export default ImportHandler;
