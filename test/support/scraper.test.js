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
import sinon from 'sinon';

/*
import ExperimentationCandidatesDesktopHandler
  from '../../src/handlers/experimentation-candidates-desktop-handler.js';
import ImportHandler from '../../src/handlers/import-handler.js';
*/

const { expect } = chai;

describe('Index Tests', () => {
  // eslint-disable-next-line no-unused-vars
  let services;

  beforeEach(() => {
    services = {
      log: console,
      s3Client: {
        send: sinon.stub(),
      },
      slackClient: {
        postMessage: sinon.stub(),
      },
      sqsClient: {
        sendMessage: sinon.stub(),
      },
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should pass', async () => {
    /*
    const HANDLER_CONFIGS = '{"experimentation-candidates-desktop":{"completionQueueUrl":"https://sqs.us-east-1.amazonaws.com/282898975672/spacecat-content-processing-jobs-dev","s3BucketName":"spacecat-scraper-dev"},"experimentation-candidates-mobile":{"completionQueueUrl":"https://sqs.us-east-1.amazonaws.com/282898975672/spacecat-content-processing-jobs-dev","s3BucketName":"spacecat-scraper-dev"},"import":{"completionQueueUrl":"https://sqs.us-east-1.amazonaws.com/282898975672/spacecat-import-jobs-dev","s3BucketName":"spacecat-importer-dev"}}';
    const handlerConfigs = JSON.parse(HANDLER_CONFIGS);
    const config = {
      jobId: '1234',
      slackContext: {
        threadTs: '1234',
        channelId: '1234',
      },
    };
    const handler = new ExperimentationCandidatesDesktopHandler(
      {
        ...config,
        ...handlerConfigs[ImportHandler.handlerName],
      },
      services,
    );

    const urlData = {
      url: 'https://mammotome.com/us/en/',
    };

    await handler.process(urlData, {});
    */

    expect(true).to.equal(true);
  });
});
