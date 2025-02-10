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
});
