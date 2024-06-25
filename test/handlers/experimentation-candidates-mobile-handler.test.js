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

import AbstractHandler from '../../src/handlers/abstract-handler.js';
import ExperimentationCandidatesMobileHandler from '../../src/handlers/experimentation-candidates-mobile-handler.js';

describe('ExperimentationCandidatesMobileHandler', () => {
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
        sendMessage: sinon.stub().returns({ promise: () => Promise.resolve() }),
      },
      s3Client: {
        send: sinon.stub().returns({ promise: () => Promise.resolve() }),
      },
      slackClient: {
        postMessage: sinon.stub().returns({ promise: () => Promise.resolve() }),
      },
    };

    handler = new ExperimentationCandidatesMobileHandler(mockConfig, mockServices);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('should create an instance of ExperimentationCandidatesMobileHandler', () => {
      expect(handler).to.be.instanceOf(ExperimentationCandidatesMobileHandler);
      expect(handler.handlerName).to.equal('experimentation-candidates-mobile');
    });

    it('should inherit from AbstractHandler', () => {
      expect(handler).to.be.instanceOf(AbstractHandler);
    });

    it('should validate config and services', () => {
      expect(() => new ExperimentationCandidatesMobileHandler(
        mockConfig,
        mockServices,
      )).to.not.throw();
    });
  });

  describe('accepts', () => {
    it('should return true for matching processing type', () => {
      expect(ExperimentationCandidatesMobileHandler.accepts('experimentation-candidates-mobile')).to.be.true;
    });

    it('should return false for non-matching processing type', () => {
      expect(ExperimentationCandidatesMobileHandler.accepts('non-matching-type')).to.be.false;
    });
  });
});
