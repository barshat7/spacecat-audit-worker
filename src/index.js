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
import { FirefallClient } from '@adobe/spacecat-shared-gpt-client';
import { internalServerError, noContent } from '@adobe/spacecat-shared-http-utils';
import { BaseSlackClient, SLACK_TARGETS } from '@adobe/spacecat-shared-slack-client';
import { sqsEventAdapter, resolveSecretsName, sqsWrapper } from '@adobe/spacecat-shared-utils';

import scrapeURL from './scraper/handler.js';

async function run(message, context) {
  const { log, sqs } = context;
  const { url } = message;
  const {
    SCRAPING_JOBS_QUEUE_URL: queueUrl,
  } = context.env;

  const firefallClient = FirefallClient.createFrom(context);
  const slackClient = BaseSlackClient.createFrom(context, SLACK_TARGETS.WORKSPACE_INTERNAL);

  log.info(`Content Scraper received a message. Scraping URL: ${JSON.stringify(message)}`);

  try {
    const result = await scrapeURL(url, firefallClient, slackClient, log);

    log.info(`Firefall Result: ${result}`);

    await sqs.sendMessage(queueUrl, {
      scraperResult: result,
    });

    return noContent();
  } catch (e) {
    log.error(`Error scraping URL: ${e}`);
    await slackClient.postMessage({
      channel: 'C06HUH04FJ6',
      text: `:alert: Error scraping URL: ${e}`,
    });
    return internalServerError(e.message);
  }
}

export const main = wrap(run)
  .with(sqsEventAdapter)
  .with(sqsWrapper)
  .with(secrets, { name: resolveSecretsName })
  .with(helixStatus);
