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
import { expect } from 'chai';
import {
  describe, it, beforeEach, afterEach,
} from 'mocha';
import sinon from 'sinon';
import AbstractHandler from '../../src/handlers/abstract-handler.js';
import FormHandler from '../../src/handlers/form-handler.js';
import { SCREENSHOT_TYPES } from '../../src/support/screenshot.js';

describe('FormHandler', () => {
  let handler;
  let mockConfig;
  let mockServices;

  beforeEach(() => {
    mockConfig = {
      jobId: 'test-job-id',
      s3BucketName: 'test-bucket',
      completionQueueUrl: 'https://sqs.test.com/queue',
      slackContext: {},
      device: {},
    };
    mockServices = {
      log: {
        info: sinon.stub(),
        error: sinon.stub(),
      },
      sqsClient: {
        sendMessage: sinon.stub().resolves({}),
      },
      s3Client: {
        // for aws-xray mocking
        middlewareStack: {
          remove: sinon.stub(),
          use: sinon.stub(),
        },
        send: sinon.stub().resolves({}),
      },
      slackClient: {
        postMessage: sinon.stub().resolves({}),
      },
    };

    mockServices.xray = {
      captureAWSv3Client: sinon.stub().returns(mockServices.s3Client),
      getSegment: sinon.stub(),
      Segment: sinon.stub().returns({
        addNewSubsegment: sinon.stub().returns({
          addError: sinon.stub(),
          close: sinon.stub(),
        }),
      }),
    };

    handler = new FormHandler(mockConfig, mockServices);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('creates an instance of FormHandler', () => {
      expect(handler).to.be.instanceOf(FormHandler);
      expect(handler.handlerName).to.equal('form');
    });

    it('inherits from AbstractHandler', () => {
      expect(handler).to.be.instanceOf(AbstractHandler);
    });
    it('validates config and services', () => {
      expect(() => new FormHandler(mockConfig, mockServices)).to.not.throw();
    });
  });

  describe('accepts', () => {
    it('returns true for matching processing type', () => {
      expect(FormHandler.accepts('form')).to.be.true;
    });

    it('returns false for non-matching processing type', () => {
      expect(FormHandler.accepts('non-matching-type')).to.be.false;
    });
  });

  describe('process', () => {
    it('enables screenshots and thumbnails by default', () => {
      // Mock AbstractHandler process method
      sinon.stub(AbstractHandler.prototype, 'process').resolves({});
      handler.process([]);

      expect(AbstractHandler.prototype.process.calledOnce).to.be.true;

      const passedOptions = AbstractHandler.prototype.process.args[0][2];
      expect(passedOptions.screenshotTypes.includes(SCREENSHOT_TYPES.FULL_PAGE)).to.be.true;
      expect(passedOptions.screenshotTypes.includes(SCREENSHOT_TYPES.THUMBNAIL)).to.be.true;
    });
  });

  describe('processUrl', () => {
    it('throws an error if URL is not provided', async () => {
      try {
        await handler.processUrl({});
      } catch (error) {
        expect(error.message).to.equal('URL is not provided');
      }
    });
    it('handles URL processing errors', async () => {
      const urlData = { url: 'invalid-url', urlId: 'test-id' };
      const result = await handler.processUrl(urlData);

      expect(result).to.deep.equal({
        error: 'Invalid URL: invalid-url',
      });
      expect(mockServices.log.error.calledOnce).to.be.true;
    });
  });

  describe('getScriptPath', () => {
    it('handles get script path', async () => {
      const result = await handler.getScriptPath();
      expect(result).contains('static/evaluate/form.js');
    });
  });

  describe('createCompletionMessage', () => {
    it('transforms successful scrape results correctly', async () => {
      const results = [{
        urlId: 'test-url-id',
        finalUrl: 'https://example.com',
        status: 'COMPLETE',
        location: 's3://bucket/path',
        scrapeResult: {
          path: '/form/path',
        },
        jobMetadata: {
          key: 'value',
        },
      }];

      const message = handler.createCompletionMessage(results);

      expect(message).to.deep.equal({
        jobId: 'test-job-id',
        processingType: 'form',
        slackContext: {},
        siteId: undefined,
        type: 'forms-opportunities',
        auditContext: undefined,
        scrapeResults: [{
          location: 's3://bucket/path',
          metadata: {
            urlId: 'test-url-id',
            url: 'https://example.com',
            status: 'COMPLETE',
            path: '/form/path',
            jobMetadata: {
              key: 'value',
            },
          },
        }],
      });
    });

    it('transforms error results correctly', async () => {
      const results = [{
        url: 'https://example.com',
        urlId: 'test-url-id',
        error: new Error('Processing failed'),
        jobMetadata: {
          key: 'value',
        },
      }];

      const message = handler.createCompletionMessage(results);

      expect(message).to.deep.equal({
        jobId: 'test-job-id',
        processingType: 'form',
        slackContext: {},
        auditContext: undefined,
        siteId: undefined,
        type: 'forms-opportunities',
        scrapeResults: [{
          metadata: {
            url: 'https://example.com',
            urlId: 'test-url-id',
            reason: 'Processing failed',
            status: 'FAILED',
            jobMetadata: {
              key: 'value',
            },
          },
        }],
      });
    });

    it('transforms RedirectError results correctly', async () => {
      const RedirectError = (await import('../../src/support/redirect-error.js')).default;
      const results = [{
        url: 'https://example.com',
        urlId: 'test-url-id',
        error: new RedirectError('Redirect detected'),
        jobMetadata: {
          key: 'value',
        },
      }];

      const message = handler.createCompletionMessage(results);

      expect(message).to.deep.equal({
        jobId: 'test-job-id',
        processingType: 'form',
        slackContext: {},
        auditContext: undefined,
        siteId: undefined,
        type: 'forms-opportunities',
        scrapeResults: [{
          metadata: {
            url: 'https://example.com',
            urlId: 'test-url-id',
            reason: 'Redirect detected',
            status: 'REDIRECT',
            jobMetadata: {
              key: 'value',
            },
          },
        }],
      });
    });

    it('handles results with default status when not provided', async () => {
      const results = [{
        urlId: 'test-url-id',
        finalUrl: 'https://example.com',
        location: 's3://bucket/path',
        scrapeResult: {
          path: '/form/path',
        },
        jobMetadata: {
          key: 'value',
        },
      }];

      const message = handler.createCompletionMessage(results);

      expect(message.scrapeResults[0].metadata.status).to.equal('COMPLETE');
    });

    it('handles multiple results with mixed success and errors', async () => {
      const RedirectError = (await import('../../src/support/redirect-error.js')).default;
      const results = [
        {
          urlId: 'success-id',
          finalUrl: 'https://example.com/success',
          status: 'COMPLETE',
          location: 's3://bucket/path1',
          scrapeResult: {
            path: '/form/path1',
          },
          jobMetadata: { type: 'success' },
        },
        {
          url: 'https://example.com/error',
          urlId: 'error-id',
          error: new Error('Failed processing'),
          jobMetadata: { type: 'error' },
        },
        {
          url: 'https://example.com/redirect',
          urlId: 'redirect-id',
          error: new RedirectError('Redirect found'),
          jobMetadata: { type: 'redirect' },
        },
      ];

      const message = handler.createCompletionMessage(results);

      expect(message.scrapeResults).to.have.length(3);
      expect(message.scrapeResults[0].metadata.status).to.equal('COMPLETE');
      expect(message.scrapeResults[1].metadata.status).to.equal('FAILED');
      expect(message.scrapeResults[2].metadata.status).to.equal('REDIRECT');
    });
  });
});
