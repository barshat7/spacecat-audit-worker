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
import nock from 'nock';
import { v4 as uuidv4 } from 'uuid';

import { main as runLambda } from '../src/index.js';

const log = {
  error: sinon.spy(),
  info: sinon.spy(),
};

const createMockContext = (mockMessage, mockHandlers) => ({
  log,
  attributes: { handlers: mockHandlers },
  sqs: {
    sendMessage: sinon.stub().returns({ promise: () => Promise.resolve() }),
  },
  env: {
    HANDLER_CONFIGS: JSON.stringify({
      'mock-handler': {},
    }),
    SLACK_TOKEN_WORKSPACE_INTERNAL: 'slack-token',
    SLACK_OPS_CHANNEL_WORKSPACE_INTERNAL: 'slack-channel',
  },
  invocation: {
    event: {
      Records: [{
        body: JSON.stringify(mockMessage),
        messageId: '1234',
      }],
    },
  },
});

const createMockHandler = (errors) => class MockHandler {
  static handlerName = 'mock-handler';

  static accepts() {
    return true;
  }

  // eslint-disable-next-line class-methods-use-this
  async process() {
    if (errors) {
      throw new Error('Handler error');
    }
    return Promise.resolve();
  }
};

describe('index.js', () => {
  let mockMessage;
  let mockHandler;

  beforeEach(() => {
    mockHandler = createMockHandler();
    mockMessage = {
      jobId: uuidv4(),
      options: {},
      processingType: 'desktop',
      slackContext: {},
      urls: ['https://example.com'],
    };
  });

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  describe('validateInput indirectly through run', () => {
    it('returns internal server error when processingType is missing', async () => {
      const invalidMessage = { ...mockMessage, processingType: '' };
      const context = createMockContext(invalidMessage);
      context.attributes = undefined; // for coverage branch
      const response = await runLambda(invalidMessage, context);

      expect(response.status).to.equal(500);
      expect(log.error.calledWith('Error scraping URL: Error: Missing processingType')).to.be.true;
      expect(await response.json()).to.deep.equal({ message: 'Missing processingType' });
    });

    it('returns internal server error when URLs are missing', async () => {
      const invalidMessage = { ...mockMessage, urls: [] };
      const response = await runLambda(invalidMessage, createMockContext(invalidMessage));

      expect(response.status).to.equal(500);
      expect(log.error.calledWith('Error scraping URL: Error: Missing URLs')).to.be.true;
      expect(await response.json()).to.deep.equal({ message: 'Missing URLs' });
    });

    it('returns internal server error when URLs is not an array', async () => {
      const invalidMessage = { ...mockMessage, urls: '' };
      const response = await runLambda(invalidMessage, createMockContext(invalidMessage));

      expect(response.status).to.equal(500);
      expect(log.error.calledWith('Error scraping URL: Error: Missing URLs')).to.be.true;
      expect(await response.json()).to.deep.equal({ message: 'Missing URLs' });
    });
  });

  describe('run', () => {
    it('returns internal server error if handler config is missing', async () => {
      const context = createMockContext(mockMessage, [mockHandler]);
      context.env.HANDLER_CONFIGS = '{}';
      const response = await runLambda(mockMessage, context);

      expect(response.status).to.equal(500);
      expect(await response.json()).to.deep.equal({ message: 'Missing handler configuration for mock-handler' });
    });

    it('logs error if handler throws error', async () => {
      const context = createMockContext(mockMessage, [createMockHandler(true)]);
      const response = await runLambda(mockMessage, context);

      expect(response.status).to.equal(204);
      expect(log.error.calledWith('Error for handler mock-handler: Handler error')).to.be.true;
      expect(await response.text()).to.equal('');
    });

    it('returns no content when processing is successful', async () => {
      const response = await runLambda(mockMessage, createMockContext(mockMessage, [mockHandler]));
      expect(response.status).to.equal(204);
      expect(await response.text()).to.equal('');
    });
  });
});
