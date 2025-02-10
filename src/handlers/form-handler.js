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
  }

  static accepts(processingType) {
    return processingType === FormHandler.handlerName;
  }

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
}

export default FormHandler;
