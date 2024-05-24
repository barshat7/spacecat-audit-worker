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

import { hasText } from '@adobe/spacecat-shared-utils';
import { BaseSlackClient, SLACK_TARGETS } from '@adobe/spacecat-shared-slack-client';

let slackClient = null;

/**
 * Send a message to a Slack channel. If the message is a reply, it will be sent as a thread.
 *
 * @param contex {UniversalContext} - The context object.
 * @param slackContext {object} - The Slack context object.
 * @param message {string} - The message to send.
 * @return {Promise<void>} - A promise that resolves when the message is sent.
 */
export async function sendSlackMessage(context, slackContext, message) {
  const { threadTs, channelId } = slackContext;
  if (hasText(threadTs) && hasText(channelId)) {
    if (!slackClient) {
      slackClient = BaseSlackClient.createFrom(
        context,
        SLACK_TARGETS.WORKSPACE_INTERNAL,
      );
    }
    await slackClient.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: message,
      unfurl_links: false,
    });
  }
}
