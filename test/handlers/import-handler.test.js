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
import nock from 'nock';
import puppeteer from 'puppeteer-extra';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import ImportHandler from '../../src/handlers/import-handler.js';

chai.use(chaiAsPromised);

const { expect } = chai;

const createBrowserStub = (pageStub) => sinon.stub(puppeteer, 'launch').resolves({
  newPage: () => pageStub,
  close: sinon.stub(),
  userAgent: async () => 'test-user-agent',
  process: () => ({
    spawnargs: ['--user-data-dir=/tmp/puppeteer_dev_profile'],
  }),

});

const createPageStub = (scrapeResult = {}, url = 'https://libre-software.net/image/avif-test/') => ({
  close: sinon.stub(),
  goto: sinon.stub(),
  emulate: sinon.stub(),
  waitForSelector: sinon.stub(),
  setJavaScriptEnabled: sinon.stub(),
  evaluate: sinon.stub().resolves(scrapeResult),
  url: sinon.stub().returns(url),
  isClosed: sinon.stub().returns(false),
  setViewport: sinon.stub(),
  setUserAgent: sinon.stub(),
});

describe('ImportHandler', () => {
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
      device: {},
    };
    mockGetObjectHandler = async () => {
      const error = new Error('The specified key does not exist.');
      error.name = 'NoSuchKey';
      return Promise.reject(error);
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

    handler = new ImportHandler(mockConfig, mockServices);
  });

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  it('triggers image conversion', async () => {
    const md = '## Import handler test page\n\n![AVIF test image or WebP fallback image][image5]\n\nSome other text\n\n[image5]: https://libre-software.net/wp-content/uploads/AVIF/AVIF%20Test%20picture%20-%20WebP%20fallback%20image.webp';
    const pageStub = createPageStub({ md });
    createBrowserStub(pageStub);

    const results = await handler.process([{ url: 'https://example.com' }]);

    expect(results.length).to.equal(1);
    expect(results[0]).to.have.property('scrapeResult');
    expect(results[0].scrapeResult).to.deep.equal({ md });
    expect(pageStub.setJavaScriptEnabled.callCount).to.equal(0);
    expect(pageStub.goto.calledWith('https://example.com', { waitUntil: 'networkidle2', timeout: 30000 })).to.be.true;
  }).timeout(3000);

  it('fails converting image', async () => {
    const md = '## Import handler test page\n\n![Hello World](data:image/dummy;base64,iVBORw0K[...]ElFTkSuQmCC)\n\nSome other text\n\n';
    const pageStub = createPageStub({ md });
    createBrowserStub(pageStub);

    const results = await handler.process([{ url: 'https://example.com' }]);

    expect(results.length).to.equal(1);
    expect(results[0]).to.have.property('scrapeResult');
    expect(results[0].scrapeResult).to.deep.equal({ md });
    expect(pageStub.setJavaScriptEnabled.callCount).to.equal(0);
    expect(pageStub.goto.calledWith('https://example.com', { waitUntil: 'networkidle2', timeout: 30000 })).to.be.true;
  });

  describe('Storage', () => {
    it('stores the scrape result in S3', async () => {
      const scrapeResult = { data: 'scraped data' };

      const pageStub = createPageStub(scrapeResult);
      createBrowserStub(pageStub);

      const results = await handler.process([{ url: 'https://libre-software.net/image/avif-test/' }]);

      expect(mockServices.s3Client.send.calledTwice).to.be.true;
      expect(results.length).to.equal(1);
      expect(results[0].finalUrl).to.equal('https://libre-software.net/image/avif-test/');
      expect(results[0].scrapeTime).to.be.a('number');
      expect(results[0].scrapedAt).to.be.a('number');
      expect(results[0].location).to.equal('imports/test-job-id/docx/undefined.docx');
      expect(results[0].userAgent).to.equal('test-user-agent');
      expect(results[0].scrapeResult).to.deep.equal(scrapeResult);
      expect(mockServices.s3Client.send.calledTwice).to.be.true;
      expect(pageStub.evaluate.callCount).to.equal(2);
    });
  });

  describe('accepts', () => {
    it('returns true for a subclass that implements the method', () => {
      expect(ImportHandler.accepts('import')).to.be.true;
    });
  });

  it('throws an error if the method is not implemented in a subclass', () => {
    expect(ImportHandler.accepts('dummy')).to.be.false;
  });

  describe('CustomInjectCode', () => {
    beforeEach(() => {
      // Override to simulate finding a custom import.js script in S3
      mockGetObjectHandler = async () => {
        const fileStream = fs.createReadStream(
          'test/fixtures/bundled-custom-import-script.js',
        );
        return {
          Body: fileStream,
        };
      };
    });

    it('reads the custom import.js script', async () => {
      const customInjectCode = await handler.getCustomInjectCode();
      expect(customInjectCode).to.include('h1.textContent = \'Import as a Service\';');
    });

    it('should handle a non-NoSuchKey error from S3', async () => {
      mockGetObjectHandler = async () => {
        throw new Error('Simulated S3 error');
      };
      await expect(handler.getCustomInjectCode()).to.be.rejectedWith(Error, 'Simulated S3 error');
    });

    it('should inject a import script during scraping', async () => {
      const scrapeResult = { data: 'scraped data from custom script' };

      const pageStub = createPageStub(scrapeResult);
      createBrowserStub(pageStub);

      const results = await handler.process([{ url: 'https://libre-software.net/image/avif-test/' }]);

      expect(results.length).to.equal(1);
      expect(results[0].scrapeResult).to.deep.equal(scrapeResult);
      expect(mockServices.s3Client.send.calledTwice).to.be.true;
      expect(pageStub).to.have.property('evaluate');

      // .evaluate(..) should be called once more than earlier tests, since we invoked it with
      // the custom inject code
      expect(pageStub.evaluate.callCount).to.equal(3);
      // [1][0] = [2nd call of the stub][1st argument]
      expect(pageStub.evaluate.args[1][0]).to.include('const CustomImportScript = (() => {');
      expect(pageStub.evaluate.args[1][0]).to.include('h1.textContent = \'Import as a Service\';');
    });

    it('should handle a redirect', async () => {
      const scrapeResult = { data: 'scraped data' };

      const pageStub = createPageStub(scrapeResult, 'https://example.com');
      createBrowserStub(pageStub);

      pageStub.goto.resolves({
        url: () => 'https://redirected-url.com',
        request: () => ({
          redirectChain: () => [{
            url: 'https://example.com',
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' },
          }], // Simulate a redirect chain
        }),
      });
      const results = await handler.process([{ url: 'https://example.com', urlId: '1234' }]);

      expect(results.length).to.equal(1);
      expect(results[0].error.message).to.deep.equal('Redirected to https://redirected-url.com from https://example.com');
      expect(mockServices.sqsClient.sendMessage.firstCall.args[1].scrapeResults).to.deep.equal([{
        metadata: {
          url: 'https://example.com',
          urlId: '1234',
          status: 'REDIRECT',
          reason: 'Redirected to https://redirected-url.com from https://example.com',
        },
      }]);
    });
  });
});
