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
import { Headers, Request } from '@adobe/fetch';
import sinon from 'sinon';
import nock from 'nock';
import { v4 as uuidv4 } from 'uuid';

import { main as runLambda } from '../src/index.js';

const log = {
  debug: sinon.spy(),
  error: sinon.spy(),
  info: sinon.spy(),
};

const createMockRequest = (mockData) => new Request('https://example.com', {
  method: 'POST',
  body: JSON.stringify(mockData),
  headers: new Headers([
    ['content-type', 'application/json'],
    ['x-api-key', 'admin-api-key'],
  ]),
});

const createMockContext = (mockHandlers) => ({
  log,
  attributes: { handlers: mockHandlers },
  env: {
    ADMIN_API_KEY: 'admin-api-key',
    USER_API_KEY: 'user-api-key',
    HANDLER_CONFIGS: JSON.stringify({ 'mock-handler': {} }),
    SLACK_TOKEN_WORKSPACE_INTERNAL: 'slack-token',
    SLACK_OPS_CHANNEL_WORKSPACE_INTERNAL: 'slack-channel',
  },
  sqs: {
    sendMessage: sinon.stub().returns({ promise: () => Promise.resolve() }),
  },
});

const createMockHandler = (errors) => class MockHandler {
  static handlerName = 'mock-handler';

  static accepts() {
    return true;
  }

  // eslint-disable-next-line class-methods-use-this
  getName() {
    return 'mock-handler';
  }

  // eslint-disable-next-line class-methods-use-this
  async process() {
    if (errors) {
      throw new Error('Handler error');
    }
    return Promise.resolve([
      { url: 'https://example.com/1', scrapeResult: { rawBody: 'body' } },
      { url: 'https://example.com/2', error: 'test-error' },
    ]);
  }
};

describe('index.js', () => {
  let mockData;
  let mockHandler;

  beforeEach(() => {
    mockHandler = createMockHandler();
    mockData = {
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
    it('returns bad request when URLs is not an array', async () => {
      const invalidRequest = createMockRequest({ ...mockData, urls: '' });
      const response = await runLambda(invalidRequest, createMockContext());

      expect(response.status).to.equal(400);
      expect(await response.json()).to.deep.equal({ message: 'Missing URLs' });
    });

    it('returns bad request when too many URLs', async () => {
      const invalidRequest = createMockRequest({ ...mockData, urls: new Array(11).fill('https://example.com') });
      const response = await runLambda(invalidRequest, createMockContext());

      expect(response.status).to.equal(400);
      expect(await response.json()).to.deep.equal({ message: 'Too many URLs' });
    });
  });

  describe('run', () => {
    it('returns internal server error if handler config is missing', async () => {
      const request = createMockRequest(mockData);
      const context = createMockContext([mockHandler]);
      context.env.HANDLER_CONFIGS = '{}';
      const response = await runLambda(request, context);

      expect(response.status).to.equal(500);
      expect(await response.json()).to.deep.equal({ message: 'Missing handler configuration for mock-handler' });
    });

    it('returns internal server error if handler throws error', async () => {
      const request = createMockRequest(mockData);
      const context = createMockContext([createMockHandler(true)]);
      const response = await runLambda(request, context);

      expect(response.status).to.equal(500);
      expect(log.error.calledWith('Error for handler mock-handler: Handler error')).to.be.true;
      expect(await response.json()).to.eql({ message: 'internal server error' });
    });

    it('returns no content when processing is successful', async () => {
      const request = createMockRequest(mockData);
      const response = await runLambda(request, createMockContext([mockHandler]));
      expect(response.status).to.equal(200);

      const body = await response.json();

      expect(body).to.have.property('id');
      expect(body).to.have.property('status', 'COMPLETE');
      expect(body).to.have.property('startTime');
      expect(body).to.have.property('endTime');
      expect(body).to.have.property('urlCount', 2);
      expect(body).to.have.property('successCount', 1);
      expect(body).to.have.property('failedCount', 1);
      expect(body).to.have.property('results');
      expect(body.results).to.be.an('array');
      expect(body.results).to.have.length(2);
      expect(body.results[0]).to.eql({
        content: 'body',
        error: null,
        status: 'COMPLETE',
        url: 'https://example.com/1',
      });
      expect(body.results[1]).to.eql({
        error: 'test-error',
        status: 'FAILED',
        url: 'https://example.com/2',
      });
    });
  });
});
