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
import { badRequest, internalServerError, ok } from '@adobe/spacecat-shared-http-utils';
import { selectHandler } from './support/utils.js';

const PROCESSING_TYPE = 'default';

export default async function runHTTP(request, context = false) {
  const { attributes } = context;
  const { handlers, services } = attributes;
  const { log } = services;
  const {
    jobId = uuidv4(),
    options = {},
    slackContext = {},
    urls,
  } = context.data;

  try {
    if (!Array.isArray(urls) || urls.length === 0) {
      return badRequest('Missing URLs');
    }

    if (urls.length > 10) {
      return badRequest('Too many URLs');
    }

    const config = {
      jobId, slackContext, skipMessage: true, skipStorage: true,
    };
    const handler = selectHandler(context, handlers, services, config, PROCESSING_TYPE);

    try {
      const startTime = new Date();
      const results = await handler.process(urls, options);
      const endTime = new Date();
      const failedCount = results.filter((r) => r.error).length;
      const successCount = results.length - failedCount;

      return ok({
        id: jobId,
        status: 'COMPLETE',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        urlCount: results.length,
        successCount,
        failedCount,
        results: results.map((r) => ({
          content: r.scrapeResult?.rawBody,
          url: r.url,
          status: r.error ? 'FAILED' : 'COMPLETE',
          error: r.error || null,
        })),
      });
    } catch (e) {
      log.error(`Error for handler ${handler.getName()}: ${e.message}`, e);
      return internalServerError();
    }
  } catch (e) {
    log.error(`Error scraping URL: ${e}`);
    return internalServerError(e.message);
  }
}
