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

import wrap from '@adobe/helix-shared-wrap';
import secrets from '@adobe/helix-shared-secrets';
import { helixStatus } from '@adobe/helix-status';
import { internalServerError, noContent } from '@adobe/spacecat-shared-http-utils';
import {
  sqsEventAdapter,
  resolveSecretsName,
  sqsWrapper,
  isValidUrl,
} from '@adobe/spacecat-shared-utils';

import { v4 as uuidv4 } from 'uuid';

import scapeAndStore from './handlers/scrape-and-store.js';
import { sendSlackMessage } from '../support/utils.js';

async function run(message, context) {
  const { log, sqs } = context;
  const {
    url,
    jobId = uuidv4(),
    slackContext = {},
    processingType,
  } = message;
  const {
    SCRAPING_JOBS_QUEUE_URL: queueUrl,
  } = context.env;

  if (!isValidUrl(url)) {
    log.error(`Missing required parameters: ${JSON.stringify(message)}`);
    return noContent();
  }

  log.info(`Received a message. Scraping URL: ${JSON.stringify(message)}`);

  try {
    const scraperResult = await scapeAndStore(url, jobId, context, slackContext);

    const completedMessage = {
      url,
      jobId,
      processingType,
      slackContext,
      scraperResult,
    };

    await sendSlackMessage(context, slackContext, `Scraped URL and stored DOM for ${url} (Job: \`${jobId}\`)...`);

    await sqs.sendMessage(queueUrl, completedMessage);

    log.info(`Scraping completed. Message sent: ${JSON.stringify(completedMessage)}`);

    return noContent();
  } catch (e) {
    log.error(`Error scraping URL: ${e}`);
    return internalServerError(e.message);
  }
}

export const main = wrap(run)
  .with(sqsEventAdapter)
  .with(sqsWrapper)
  .with(secrets, { name: resolveSecretsName })
  .with(helixStatus);
