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

import chromium from '@sparticuz/chromium';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import nock from 'nock';
import puppeteer from 'puppeteer-extra';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import AbstractHandler from '../../src/handlers/abstract-handler.js';

chai.use(chaiAsPromised);

const { expect } = chai;

class TestHandler extends AbstractHandler {
  static accepts(processingType) {
    return processingType === 'test';
  }
}

const createBrowserStub = (pageStub) => sinon.stub(puppeteer, 'launch').resolves({
  newPage: () => pageStub,
  close: sinon.stub(),
  userAgent: async () => 'test-user-agent',
  process: () => ({
    spawnargs: ['--user-data-dir=/tmp/puppeteer_dev_profile'],
  }),
});

const createPageStub = (scrapeResult = {}, url = 'https://example.com') => ({
  close: sinon.stub(),
  goto: sinon.stub(),
  emulate: sinon.stub(),
  waitForSelector: sinon.stub(),
  setJavaScriptEnabled: sinon.stub(),
  evaluate: sinon.stub().resolves(scrapeResult),
  url: sinon.stub().returns(url),
  isClosed: sinon.stub().returns(false),
});

describe('AbstractHandler', () => {
  let handler;
  let mockConfig;
  let mockServices;
  let mockPage;

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
    mockServices = {
      log: {
        debug: sinon.stub(),
        info: sinon.stub(),
        error: sinon.stub(),
      },
      sqsClient: {
        sendMessage: sinon.stub().returns({ promise: () => Promise.resolve() }),
      },
      s3Client: {
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

    mockPage = createPageStub();

    handler = new TestHandler('TestHandler', mockConfig, mockServices);
  });

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  describe('Configuration and Services Validation', () => {
    it('throws an error if config is not an object', () => {
      expect(() => new TestHandler('TestHandler', null, mockServices)).to.throw('Invalid configuration: config should be an object');
    });

    it('throws an error if required config fields are missing', () => {
      delete mockConfig.jobId;
      expect(() => new TestHandler('TestHandler', mockConfig, mockServices)).to.throw('Invalid configuration: jobId is required');
    });

    it('throws an error if slackContext is not an object', () => {
      mockConfig.slackContext = 'not-an-object';
      expect(() => new TestHandler('TestHandler', mockConfig, mockServices)).to.throw('Invalid configuration: slackContext should be an object');
    });

    it('throws an error if required services are missing', () => {
      delete mockServices.log;
      expect(() => new TestHandler('TestHandler', mockConfig, mockServices)).to.throw('Invalid services: log is required');
    });
  });

  describe('Scraping', () => {
    it('launches the browser with correct options in local mode', async () => {
      const expectedOptions = {
        args: [
          '--allow-pre-commit-input',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-component-extensions-with-background-pages',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--enable-automation',
          '--enable-blink-features=IdleDetection',
          '--export-tagged-pdf',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--no-first-run',
          '--password-store=basic',
          '--use-mock-keychain',
          '--disable-domain-reliability',
          '--disable-print-preview',
          '--disable-speech-api',
          '--disk-cache-size=33554432',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings',
          '--single-process',
          '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
          '--enable-features=NetworkServiceInProcess2,SharedArrayBuffer',
          '--hide-scrollbars',
          '--ignore-gpu-blocklist',
          '--in-process-gpu',
          '--window-size=1920,1080',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--allow-running-insecure-content',
          '--disable-setuid-sandbox',
          '--disable-site-isolation-trials',
          '--disable-web-security',
          '--no-sandbox',
          '--no-zygote',
          "--headless='new'",
        ],
        defaultViewport: {
          deviceScaleFactor: 1,
          hasTouch: false,
          height: 1080,
          isLandscape: true,
          isMobile: false,
          width: 1920,
        },
        executablePath: '/opt/homebrew/bin/chromium',
        headless: true,
      };
      const browserLaunchStub = createBrowserStub(mockPage);

      await handler.process([{ url: 'https://example.com' }]);

      expect(browserLaunchStub.calledOnce).to.be.true;
      expect(browserLaunchStub.calledWith(expectedOptions)).to.be.true;
    });

    it('launches the browser with correct options in non-local mode', async () => {
      const expectedOptions = {
        args: [
          '--allow-pre-commit-input',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-component-extensions-with-background-pages',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--enable-automation',
          '--enable-blink-features=IdleDetection',
          '--export-tagged-pdf',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--no-first-run',
          '--password-store=basic',
          '--use-mock-keychain',
          '--disable-domain-reliability',
          '--disable-print-preview',
          '--disable-speech-api',
          '--disk-cache-size=33554432',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings',
          '--single-process',
          '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
          '--enable-features=NetworkServiceInProcess2,SharedArrayBuffer',
          '--hide-scrollbars',
          '--ignore-gpu-blocklist',
          '--in-process-gpu',
          '--window-size=1920,1080',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--allow-running-insecure-content',
          '--disable-setuid-sandbox',
          '--disable-site-isolation-trials',
          '--disable-web-security',
          '--no-sandbox',
          '--no-zygote',
          "--headless='new'",
        ],
        defaultViewport: {
          deviceScaleFactor: 1,
          hasTouch: false,
          height: 1080,
          isLandscape: true,
          isMobile: false,
          width: 1920,
        },
        executablePath: '/some/test/path',
        headless: 'new',
      };

      sinon.stub(chromium, 'executablePath').resolves('/some/test/path');
      const browserLaunchStub = createBrowserStub(mockPage);

      process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs14.x';
      await handler.process([{ url: 'https://example.com' }]);
      delete process.env.AWS_EXECUTION_ENV;

      expect(browserLaunchStub.calledOnce).to.be.true;
      expect(browserLaunchStub.calledWith(expectedOptions)).to.be.true;
    });

    it('returns error when invalid URL is provided', async () => {
      createBrowserStub(mockPage);
      const results = await handler.process([{ url: 'invalid-url' }]);
      expect(results.length).to.equal(1);
      expect(results[0].error).to.equal('Invalid URL: invalid-url');
    });

    it('logs the scraping process', async () => {
      const browserLaunchStub = createBrowserStub(mockPage);

      await handler.process([{ url: 'https://example.com' }]);

      expect(browserLaunchStub.calledOnce).to.be.true;
      expect(mockServices.log.info.calledWith('[TestHandler] Browser Launched')).to.be.true;
    });

    it('returns the correct scrape result', async () => {
      const pageStub = createPageStub({ data: 'scraped data' });
      createBrowserStub(pageStub);

      const results = await handler.process([{ url: 'https://example.com' }]);

      expect(results.length).to.equal(1);
      expect(results[0]).to.have.property('scrapeResult');
      expect(results[0].scrapeResult).to.deep.equal({ data: 'scraped data' });
      expect(pageStub.setJavaScriptEnabled.callCount).to.equal(0);
      expect(pageStub.goto.calledWith('https://example.com', { waitUntil: 'networkidle2', timeout: 30000 })).to.be.true;
    });

    it('loads evaluate file specific to handler', async () => {
      createBrowserStub(createPageStub({ data: 'scraped data' }));
      const importHandler = new TestHandler('import', mockConfig, mockServices);
      const results = await importHandler.process([{ url: 'https://example.com' }]);

      expect(results.length).to.equal(1);
      expect(results[0]).to.have.property('scrapeResult');
      expect(results[0].scrapeResult).to.deep.equal({ data: 'scraped data' });
    });

    it('resets browser if there is a resource error', async () => {
      const pageStub = createPageStub({ data: 'scraped data' });
      pageStub.emulate.rejects(new Error('net::ERR_INSUFFICIENT_RESOURCES'));
      const browser = createBrowserStub(pageStub);
      await handler.process([{ url: 'https://example.com' }]);
      expect(browser.calledTwice).to.be.true;
    }).timeout(3000);

    it('should kill the browser when browser.close() is taking more than 3 seconds and cleanup files', async () => {
      const browserMock = {
        newPage: sinon.stub().resolves({}),
        goto: sinon.stub().resolves(),
        waitForSelector: sinon.stub().resolves(),
        evaluate: sinon.stub().resolves({}),
        url: sinon.stub().returns('https://example.com'),
        close: sinon.stub().callsFake(() => new Promise((resolve) => {
          setTimeout(resolve, 4000);
        })),
        process: sinon.stub().returns({
          spawnargs: ['--user-data-dir=/tmp/test-profile111'],
          kill: sinon.stub(),
        }),
      };
      const rmSyncStub = sinon.stub(fs, 'rmSync');

      const files = ['core.chromium.12345', 'otherfile.txt'];
      sinon.stub(fs, 'readdirSync').returns(files);

      sinon.stub(puppeteer, 'launch').resolves(browserMock);
      sinon.stub(chromium, 'executablePath').resolves('/path/to/chromium');

      try {
        await handler.processUrl({ url: 'https://example.com' });
      } catch (e) {
        // Expected to throw due to the timeout
      }

      expect(mockServices.log.error.calledWithMatch('Error closing browser: Close timeout')).to.be.true;
      expect(browserMock.process().kill.called).to.be.true;
      expect(rmSyncStub.firstCall.args[0]).to.equal('/tmp/test-profile111');
      expect(rmSyncStub.secondCall.args[0]).to.equal('/tmp/core.chromium.12345');
    }).timeout(6000);

    it('should re-throw error if browser.close() throws an error other than "Close timeout"', async () => {
      const browserMock = {
        newPage: sinon.stub().resolves({}),
        goto: sinon.stub().resolves(),
        waitForSelector: sinon.stub().resolves(),
        evaluate: sinon.stub().resolves({}),
        url: sinon.stub().returns('https://example.com'),
        close: sinon.stub().rejects(new Error('Some other error')),
        process: sinon.stub().returns({
          spawnargs: ['--user-data-dir=/tmp/test-profile'],
          kill: sinon.stub(),
        }),
      };

      sinon.stub(puppeteer, 'launch').resolves(browserMock);
      sinon.stub(chromium, 'executablePath').resolves('/path/to/chromium');

      try {
        await handler.processUrl({ url: 'https://example.com' });
      } catch (e) {
        expect(e.message).to.equal('Some other error');
      }

      expect(mockServices.log.error.calledWithMatch('Error closing browser: Some other error')).to.be.true;
      expect(browserMock.process().kill.called).to.be.false;
    });

    it('sets options', async () => {
      createBrowserStub(mockPage);
      const importHandler = new TestHandler('import', mockConfig, mockServices);
      const options = { pageLoadTimeout: 10, enableJavascript: false };

      await importHandler.process([{ url: 'https://example.com' }], options);

      expect(mockPage.setJavaScriptEnabled.calledWith(false)).to.be.true;
      expect(mockPage.goto.calledWith('https://example.com', { waitUntil: 'networkidle2', timeout: 10 })).to.be.true;
    });

    it('returns error if s3 throws an error', async () => {
      mockServices.s3Client.send = sinon.stub().rejects(new Error('Test error'));
      const pageStub = createPageStub({ data: 'scraped data' });
      createBrowserStub(pageStub);

      const results = await handler.process([{ url: 'https://example.com' }]);

      expect(results.length).to.equal(1);
      expect(results[0].error).to.deep.equal('Test error');
    });
  });

  describe('Storage', () => {
    it('stores the scrape result in S3', async () => {
      const scrapeResult = { data: 'scraped data' };

      createBrowserStub(createPageStub(scrapeResult));

      const results = await handler.process([{ url: 'https://example.com' }]);

      expect(mockServices.s3Client.send.calledOnce).to.be.true;
      expect(results.length).to.equal(1);
      expect(results[0].finalUrl).to.equal('https://example.com');
      expect(results[0].scrapeTime).to.be.a('number');
      expect(results[0].scrapedAt).to.be.a('number');
      expect(results[0].location).to.equal('scrapes/test-job-id/scrape.json');
      expect(results[0].userAgent).to.equal('test-user-agent');
      expect(results[0].scrapeResult).to.deep.equal(scrapeResult);
      expect(mockServices.s3Client.send.calledOnce).to.be.true;
    });
    it('skips storage if config.skipStorage is set to true', async () => {
      const scrapeResult = { data: 'scraped data' };

      createBrowserStub(createPageStub(scrapeResult));

      const handlerWithSkipStorage = new TestHandler('TestHandler', { ...mockConfig, skipStorage: true }, mockServices);
      const results = await handlerWithSkipStorage.process([{ url: 'https://example.com' }]);

      expect(results.length).to.equal(1);
      expect(results[0].location).to.be.null;
      expect(mockServices.s3Client.send.called).to.be.false;
      expect(mockServices.log.info.calledWith('[TestHandler] Skipping storage by config')).to.be.true;
    });
  });

  describe('Messaging', () => {
    it('sends sqs message with scrape result', async () => {
      const scrapeResult = { data: 'scraped data' };

      createBrowserStub(createPageStub(scrapeResult));

      await handler.process([{ url: 'https://example.com' }]);

      expect(mockServices.sqsClient.sendMessage.calledOnce).to.be.true;
      expect(mockServices.sqsClient.sendMessage.firstCall.args[0]).to.equal('https://sqs.test.com/queue');
      expect(mockServices.sqsClient.sendMessage.firstCall.args[1]).to.eql({
        jobId: 'test-job-id',
        processingType: 'TestHandler',
        slackContext: {
          threadTs: '12345.67890',
          channelId: 'C12345678',
        },
        scrapeResults: [
          {
            location: 'scrapes/test-job-id/scrape.json',
            metadata: {
              path: undefined,
              urlId: undefined,
              url: 'https://example.com',
              status: 'COMPLETE',
            },
          },
        ],
      });
    });

    it('skips messaging if config.skipMessage is set to true', async () => {
      const scrapeResult = { data: 'scraped data' };

      createBrowserStub(createPageStub(scrapeResult));

      const handlerWithSkipMessage = new TestHandler('TestHandler', { ...mockConfig, skipMessage: true }, mockServices);
      await handlerWithSkipMessage.process([{ url: 'https://example.com' }]);

      expect(mockServices.sqsClient.sendMessage.called).to.be.false;
      expect(mockServices.log.info.calledWith('[TestHandler] Skipping completion message by config')).to.be.true;
    });
  });

  describe('accepts', () => {
    it('throws an error if the method is not implemented in a subclass', () => {
      expect(() => AbstractHandler.accepts('test')).to.throw('accepts method not implemented');
    });

    it('returns true for a subclass that implements the method', () => {
      expect(TestHandler.accepts('test')).to.be.true;
    });
  });
});
