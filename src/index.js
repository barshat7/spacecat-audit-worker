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

import { S3Client } from '@aws-sdk/client-s3';
import wrap from '@adobe/helix-shared-wrap';
import bodyData from '@adobe/helix-shared-body-data';
import secrets from '@adobe/helix-shared-secrets';
import { helixStatus } from '@adobe/helix-status';
import {
  authWrapper,
  enrichPathInfo,
  AdobeImsHandler,
  LegacyApiKeyHandler,
} from '@adobe/spacecat-shared-http-utils';
import { BaseSlackClient, SLACK_TARGETS } from '@adobe/spacecat-shared-slack-client';
import {
  isObject,
  resolveSecretsName,
  sqsEventAdapter,
  sqsWrapper,
} from '@adobe/spacecat-shared-utils';

import DefaultHandler from './handlers/default-handler.js';
import ImportHandler from './handlers/import-handler.js';
import MarkdownHandler from './handlers/markdown-handler.js';
import runSQS from './run-sqs.js';
import runHTTP from './run-http.js';

const handlerList = [
  DefaultHandler,
  ImportHandler,
  MarkdownHandler,
];

export const handlerProvider = (fn) => async (req, context) => {
  context.attributes = context.attributes || {};
  if (!Array.isArray(context.attributes.handlers) || context.attributes.handlers.length === 0) {
    context.attributes.handlers = handlerList;
  }
  return fn(req, context);
};

const serviceProvider = (fn) => async (req, context) => {
  context.attributes = context.attributes || {};
  if (!isObject(context.attributes.services)) {
    context.attributes.services = {
      log: context.log,
      s3Client: new S3Client(),
      slackClient: BaseSlackClient.createFrom(
        context,
        SLACK_TARGETS.WORKSPACE_INTERNAL,
      ),
      sqsClient: context.sqs,
    };
  }
  return fn(req, context);
};

export const wrapSQS = wrap(runSQS)
  .with(handlerProvider)
  .with(serviceProvider)
  .with(sqsEventAdapter)
  .with(sqsWrapper)
  .with(secrets, { name: resolveSecretsName })
  .with(helixStatus);

export const wrapHTTP = wrap(runHTTP)
  .with(handlerProvider)
  .with(serviceProvider)
  .with(authWrapper, { authHandlers: [LegacyApiKeyHandler, AdobeImsHandler] })
  .with(enrichPathInfo)
  .with(bodyData)
  .with(sqsWrapper)
  .with(secrets, { name: resolveSecretsName })
  .with(helixStatus);

export const main = async (event, context) => {
  const isSQSEvent = Array.isArray(context.invocation?.event?.Records);
  const handler = isSQSEvent ? wrapSQS : wrapHTTP;
  return handler(event, context);
};
