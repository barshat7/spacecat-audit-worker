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
  hasText,
  isObject,
  resolveSecretsName,
  sqsEventAdapter,
  sqsWrapper,
} from '@adobe/spacecat-shared-utils';

import { v4 as uuidv4 } from 'uuid';

import { S3Client } from '@aws-sdk/client-s3';
import { BaseSlackClient, SLACK_TARGETS } from '@adobe/spacecat-shared-slack-client';

import ExperimentationCandidatesDesktopHandler
  from './handlers/experimentation-candidates-desktop-handler.js';
import ExperimentationCandidatesMobileHandler
  from './handlers/experimentation-candidates-mobile-handler.js';

const handlers = [
  ExperimentationCandidatesDesktopHandler,
  ExperimentationCandidatesMobileHandler,
];

const validateInput = (processingType, urls) => {
  if (!hasText(processingType)) {
    throw new Error('Missing processingType');
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('Missing URLs');
  }
};

async function run(message, context) {
  const { log, sqs: sqsClient } = context;
  const {
    jobId = uuidv4(),
    options = {},
    processingType,
    slackContext = {},
    urls,
  } = message;

  validateInput(processingType, urls);

  // currently we only process the first URL
  const urlData = urls[0];

  // set up service dependencies
  const s3Client = new S3Client();
  const slackClient = BaseSlackClient.createFrom(
    context,
    SLACK_TARGETS.WORKSPACE_INTERNAL,
  );

  const config = {
    jobId,
    slackContext,
  };

  const services = {
    log,
    s3Client,
    slackClient,
    sqsClient,
  };

  try {
    const handlerConfigs = JSON.parse(context.env.HANDLER_CONFIGS);

    for (const Handler of handlers) {
      if (Handler.accepts(processingType)) {
        const handlerConfig = handlerConfigs[Handler.handlerName];

        if (!isObject(handlerConfig)) {
          throw new Error(`Missing handler configuration for ${Handler.handlerName}`);
        }

        const handler = new Handler(
          {
            ...config,
            /**
             * Handler-specific configuration:
             * - completionQueueUrl
             * - s3BucketName
             */
            ...handlerConfig,
          },
          services,
        );
        try {
          // we want sequential processing for now
          // eslint-disable-next-line no-await-in-loop
          await handler.process(urlData, options);
        } catch (e) {
          log.error(`Error for handler ${Handler.handlerName}: ${e.message}`, e);
        }
      }
    }
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
