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

import { v4 as uuidv4 } from 'uuid';
import { hasText } from '@adobe/spacecat-shared-utils';
import { internalServerError, noContent } from '@adobe/spacecat-shared-http-utils';
import { selectHandler } from './support/utils.js';

const validateInput = (processingType, urls) => {
  if (!hasText(processingType)) {
    throw new Error('Missing processingType');
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('Missing URLs');
  }
};

export default async function runSQS(data, context = false) {
  const { attributes } = context;
  const { handlers, services } = attributes;
  const { log } = services;
  const {
    jobId = uuidv4(),
    s3BucketName,
    options = {},
    processingType,
    slackContext = {},
    urls,
  } = data;

  try {
    validateInput(processingType, urls);

    const config = { jobId, slackContext, s3BucketName };
    const handler = selectHandler(context, handlers, services, config, processingType);

    try {
      // we want sequential processing for now
      // eslint-disable-next-line no-await-in-loop
      await handler.process(urls, options);
    } catch (e) {
      log.error(`Error for handler ${handler.getName()}: ${e.message}`, e);
    }

    return noContent();
  } catch (e) {
    log.error(`Error scraping URL: ${e}`);
    return internalServerError(e.message);
  }
}
