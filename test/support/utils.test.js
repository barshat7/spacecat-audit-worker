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

/* eslint-env mocha */

import { expect } from 'chai';
import sinon from 'sinon';
import { sendSlackMessage } from '../../src/support/utils.js';

describe('utils.js', () => {
  describe('sendSlackMessage', () => {
    let slackClient;
    let slackContext;

    beforeEach(() => {
      slackClient = {
        postMessage: sinon.stub().resolves(),
      };
      slackContext = {
        threadTs: '12345.67890',
        channelId: 'C12345678',
      };
    });

    afterEach(() => {
      sinon.restore();
    });

    it('does nothing if slackClient is not an object', async () => {
      await sendSlackMessage(null, slackContext, 'Test message');
      expect(slackClient.postMessage.called).to.be.false;
    });

    it('does nothing if slackContext is not an object', async () => {
      await sendSlackMessage(slackClient, null, 'Test message');
      expect(slackClient.postMessage.called).to.be.false;
    });

    it('does nothing if message is not a non-empty string', async () => {
      await sendSlackMessage(slackClient, slackContext, '');
      expect(slackClient.postMessage.called).to.be.false;
    });

    it('sends a message to Slack when all parameters are valid', async () => {
      await sendSlackMessage(slackClient, slackContext, 'Test message');
      expect(slackClient.postMessage.calledOnce).to.be.true;
      expect(slackClient.postMessage.calledWith({
        channel: 'C12345678',
        thread_ts: '12345.67890',
        text: 'Test message',
        unfurl_links: false,
      })).to.be.true;
    });

    it('does nothing if threadTs is missing in slackContext', async () => {
      slackContext.threadTs = '';
      await sendSlackMessage(slackClient, slackContext, 'Test message');
      expect(slackClient.postMessage.called).to.be.false;
    });

    it('does nothing if channelId is missing in slackContext', async () => {
      slackContext.channelId = '';
      await sendSlackMessage(slackClient, slackContext, 'Test message');
      expect(slackClient.postMessage.called).to.be.false;
    });
  });
});
