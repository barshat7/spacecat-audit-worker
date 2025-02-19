/*
 * Copyright 2025 Adobe. All rights reserved.
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

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import puppeteer from 'puppeteer-extra';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import XWalkImportHandler from '../../src/handlers/xwalk-import-handler.js';

use(chaiAsPromised);

const createBrowserStub = (pageStubs) => sinon.stub(puppeteer, 'launch').resolves({
  newPage: sinon.stub().callsFake(() => pageStubs.shift()),
  close: sinon.stub(),
  pages: sinon.stub().resolves(pageStubs),
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
  evaluate: sinon.stub().callsFake(async () => scrapeResults),
  url: sinon.stub().returns(url),
  isClosed: sinon.stub().returns(false),
  setViewport: sinon.stub(),
  setUserAgent: sinon.stub(),
});

describe('XWalkImportHandler', () => {
  let handler;
  let mockConfig;
  let mockServices;
  let mockGetObjectHandler;

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
            return mockGetObjectHandler(command);
          } else {
            return Promise.reject(new Error('Unsupported command'));
          }
        }),
      },
      slackClient: {
        postMessage: sinon.stub().returns({ promise: () => Promise.resolve() }),
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

    mockGetObjectHandler = async (command) => {
      if (command.input.Key.endsWith('component-models.json')) {
        return {
          Body: fs.createReadStream('test/fixtures/component-models.json'),
        };
      }
      if (command.input.Key.endsWith('component-filters.json')) {
        return {
          Body: fs.createReadStream('test/fixtures/component-filters.json'),
        };
      }
      if (command.input.Key.endsWith('component-definition.json')) {
        return {
          Body: fs.createReadStream('test/fixtures/component-definition.json'),
        };
      }
      return {
        Body: fs.createReadStream('test/fixtures/bundled-custom-import-script.js'),
      };
    };

    handler = new XWalkImportHandler(mockConfig, mockServices);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('process', () => {
    it('The XWalkImportHandler ', async () => {
      const md = { data: '# XWalk Import Handler' };
      const pageStub1 = createPageStub(md, 'https://example.com');
      const pageStub2 = createPageStub(md, 'https://example.com/cars');
      const pageStub3 = createPageStub(md, 'https://example.com/cars/honda');
      createBrowserStub([pageStub1, pageStub2, pageStub3]);

      const results = await handler.process([
        { url: 'https://example.com' },
        { url: 'https://example.com/cars' },
        { url: 'https://example.com/cars/honda' },
      ]);

      expect(results[0].location).to.equal('imports/test-job-id/jcr/index.xml');
      expect(results[1].location).to.equal('imports/test-job-id/jcr/cars.xml');
      expect(results[2].location).to.equal('imports/test-job-id/jcr/cars/honda.xml');
    }).timeout(4000);
  });

  describe('accepts', () => {
    it('The XWalkImportHandler only accept processing type import-xwalk.', () => {
      expect(XWalkImportHandler.accepts('import-xwalk')).to.be.true;
    });

    it('The XWalkImportHandler does not accept non import-walk processing types.', () => {
      expect(XWalkImportHandler.accepts('dummy')).to.be.false;
    });

    // test the transformScrapeResult function
    it('The XWalkImportHandler should transform the scrape result to JCR XML', async () => {
      const gold = 'title="XWalk Import Handler"';
      const result = {
        scrapeResult: { md: '# XWalk Import Handler' },
        finalUrl: 'https://example.com',
      };

      const transformResult = await handler.transformScrapeResult(result);
      expect(transformResult).to.contain(gold);
    });

    it('The XWalkImportHandler should return the storage path', async () => {
      const result = {
        scrapeResult: { md: '# XWalk Import Handler' },
        finalUrl: 'https://example.com',
      };

      // expect transformScrapeResult to set the importPath that generates the storage path
      await handler.transformScrapeResult(result);

      const storage = await handler.getStoragePath();
      expect(storage).to.equal('imports/test-job-id/jcr/index.xml');
    });

    it('The XWalkImportHandler should return the storage config', async () => {
      const result = handler.getStorageConfig();
      expect(result).to.deep.equal({ contentType: 'application/xml', extension: 'xml' });
    });

    it('The XWalkImportHandler should return the page inject code', async () => {
      const result = handler.getPageInjectCode();
      expect(result).to.not.be.null;
    });

    it('The XWalkImportHandler should throw an Error if the script can not be found for getPageInjectCode', async () => {
      sinon.stub(path, 'resolve').returns(null);
      expect(() => handler.getPageInjectCode()).to.throw(Error);
    });
  });
});
