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

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import puppeteer from 'puppeteer-extra';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import TextContentHandler from '../../src/handlers/text-content-handler.js';

chai.use(chaiAsPromised);

const { expect } = chai;

const createBrowserStub = (pageStubs) => sinon.stub(puppeteer, 'launch').resolves({
  newPage: sinon.stub().callsFake(() => {
    const pageStub = pageStubs.shift();
    return pageStub;
  }),
  close: sinon.stub(),
  userAgent: async () => 'test-user-agent',
  process: () => ({
    spawnargs: ['--user-data-dir=/tmp/puppeteer_dev_profile'],
  }),
});

const createPageStub = (scrapeResults = {}, url = 'https://example.com') => ({
  close: sinon.stub(),
  goto: sinon.stub(),
  emulate: sinon.stub(),
  waitForSelector: sinon.stub(),
  setJavaScriptEnabled: sinon.stub(),
  evaluate: sinon.stub().callsFake(async () => scrapeResults[url] || {}),
  url: sinon.stub().returns(url),
  isClosed: sinon.stub().returns(false),
});

describe('TextContentHandler', () => {
  let handler;
  let mockConfig;
  let mockServices;

  beforeEach(() => {
    mockConfig = {
      jobId: 'test-job-id',
      s3BucketName: 'test-bucket',
      completionQueueUrl: 'https://sqs.test.com/queue',
      slackContext: {
        threadTs: '12345.67890',
        channelId: 'C12345678',
      },
    };

    mockServices = {
      log: {
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
      },
      sqsClient: {
        sendMessage: sinon.stub().returns({ promise: () => Promise.resolve() }),
      },
      s3Client: {
        // for aws-xray mocking
        middlewareStack: {
          remove: sinon.stub(),
          use: sinon.stub(),
        },
        send: sinon.stub().callsFake((command) => {
          if (command instanceof PutObjectCommand) {
            return Promise.resolve();
          } else if (command instanceof GetObjectCommand) {
            const error = new Error('The specified key does not exist.');
            error.name = 'NoSuchKey';
            return Promise.reject(error);
          } else {
            return Promise.reject(new Error('Unsupported command'));
          }
        }),
      },
      slackClient: {
        postMessage: sinon.stub().returns({ promise: () => Promise.resolve() }),
      },
    };

    handler = new TextContentHandler(mockConfig, mockServices);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should process a list of urls ', async () => {
    const pageStub1 = createPageStub({ data: 'test data' }, 'https://example.com');
    const pageStub2 = createPageStub({ data: 'test data' }, 'https://example.com/path');
    createBrowserStub([pageStub1, pageStub2]);

    const results = await handler.process([{ url: 'https://example.com' }, { url: 'https://example.com/path' }]);

    expect(results.length).to.equal(2);
    expect(results[0].location).to.equal('imports/test-job-id/text-content/.txt');
    expect(results[1].location).to.equal('imports/test-job-id/text-content/path.txt');
  }).timeout(3000);
});

describe('accepts', () => {
  it('returns true for a subclass that implements the method', () => {
    expect(TextContentHandler.accepts('text-content')).to.be.true;
  });
});
