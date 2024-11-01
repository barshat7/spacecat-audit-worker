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

import { hasText, isObject, isValidUrl } from '@adobe/spacecat-shared-utils';

/**
 * Send a message to a Slack channel. If the message is a reply, it will be sent as a thread.
 *
 * @param slackClient {object} - The Slack client object.
 * @param slackContext {object} - The Slack context object.
 * @param message {string} - The message to send.
 * @return {Promise<void>} - A promise that resolves when the message is sent.
 */
export async function sendSlackMessage(slackClient, slackContext, message) {
  if (!isObject(slackClient) || !isObject(slackContext) || !hasText(message)) {
    return;
  }
  const { threadTs, channelId } = slackContext;
  if (hasText(threadTs) && hasText(channelId)) {
    await slackClient.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: message,
      unfurl_links: false,
    });
  }
}

/**
 * Send a message to an SQS queue. The message must be a valid object.
 * The queue URL must be a valid URL. The SQS client must be a valid object.
 * If any of these conditions are not met, the function will return early.
 * @param {object} sqsClient - The SQS client object.
 * @param {string} queueUrl - The URL of the SQS queue.
 * @param {object} message - The message to send.
 * @param {string} messageGroupId - (Optional) The message group ID for FIFO queues.
 * @return {Promise<void>} - A promise that resolves when the message is sent.
 */
export async function sendSQSMessage(sqsClient, queueUrl, message, messageGroupId = undefined) {
  if (!isObject(sqsClient) || !isValidUrl(queueUrl) || !isObject(message)) {
    return;
  }
  await sqsClient.sendMessage(queueUrl, message, messageGroupId);
}

/**
 * Selects the appropriate handler for the given processing type.
 * If no handler is found, returns null.
 * @param {object} context - The context object.
 * @param {Array} handlers - The array of handler classes.
 * @param {object} services - The services object.
 * @param {object} config - The configuration object.
 * @param {string} processingType - The processing type.
 * @return {*|null} - The handler object.
 * @throws {Error} - If no handler is found.
 */
export function selectHandler(context, handlers, services, config, processingType) {
  const handlerConfigs = JSON.parse(context.env.HANDLER_CONFIGS);
  for (const Handler of handlers) {
    if (Handler.accepts(processingType)) {
      const handlerConfig = handlerConfigs[Handler.handlerName];

      if (!isObject(handlerConfig)) {
        throw new Error(`Missing handler configuration for ${Handler.handlerName}`);
      }

      return new Handler(
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
    }
  }
  throw new Error(`No handler found for processingType: ${processingType}`);
}
