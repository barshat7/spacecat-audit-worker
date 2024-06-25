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
});

const createPageStub = (scrapeResult = {}, url = 'https://example.com') => ({
  close: sinon.stub(),
  goto: sinon.stub(),
  emulate: sinon.stub(),
  waitForSelector: sinon.stub(),
  setJavaScriptEnabled: sinon.stub(),
  evaluate: sinon.stub().resolves(scrapeResult),
  url: sinon.stub().returns(url),
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

      await handler.process({ url: 'https://example.com' });

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
      await handler.process({ url: 'https://example.com' });
      delete process.env.AWS_EXECUTION_ENV;

      expect(browserLaunchStub.calledOnce).to.be.true;
      expect(browserLaunchStub.calledWith(expectedOptions)).to.be.true;
    });

    it('throws error when invalid URL is provided', async () => {
      await expect(handler.process({ url: 'invalid-url' })).to.be.rejectedWith('Invalid URL');
    });

    it('logs the scraping process', async () => {
      const browserLaunchStub = createBrowserStub(mockPage);

      await handler.process({ url: 'https://example.com' });

      expect(browserLaunchStub.calledOnce).to.be.true;
      expect(mockServices.log.info.calledWith('[TestHandler] Browser Launched')).to.be.true;
    });

    it('returns the correct scrape result', async () => {
      const pageStub = createPageStub({ data: 'scraped data' });
      createBrowserStub(pageStub);

      const result = await handler.process({ url: 'https://example.com' });

      expect(result).to.have.property('scrapeResult');
      expect(result.scrapeResult).to.deep.equal({ data: 'scraped data' });
      expect(pageStub.setJavaScriptEnabled.callCount).to.equal(0);
      expect(pageStub.goto.calledWith('https://example.com', { waitUntil: 'networkidle2', timeout: 30000 })).to.be.true;
    });

    it('loads evaluate file specific to handler', async () => {
      createBrowserStub(createPageStub({ data: 'scraped data' }));
      const importHandler = new TestHandler('import', mockConfig, mockServices);
      const result = await importHandler.process({ url: 'https://example.com' });

      expect(result).to.have.property('scrapeResult');
      expect(result.scrapeResult).to.deep.equal({ data: 'scraped data' });
    });

    it('sets options', async () => {
      createBrowserStub(mockPage);
      const importHandler = new TestHandler('import', mockConfig, mockServices);
      const options = { pageLoadTimeout: 10, enableJavascript: false };

      await importHandler.process({ url: 'https://example.com' }, options);

      expect(mockPage.setJavaScriptEnabled.calledWith(false)).to.be.true;
      expect(mockPage.goto.calledWith('https://example.com', { waitUntil: 'networkidle2', timeout: 10 })).to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('logs and sends a Slack message on processing error', async () => {
      const error = new Error('Test error');
      sinon.stub(puppeteer, 'launch').rejects(error);

      try {
        await handler.process({ url: 'https://example.com' });
      } catch (e) {
        expect(e).to.equal(error);
        expect(mockServices.log.error.calledWith('[TestHandler] Failed to process', error)).to.be.true;
        expect(mockServices.slackClient.postMessage.calledTwice).to.be.true;
      }
    });
  });

  describe('Storage', () => {
    it('stores the scrape result in S3', async () => {
      const scrapeResult = { data: 'scraped data' };

      createBrowserStub(createPageStub(scrapeResult));

      const result = await handler.process({ url: 'https://example.com' });

      expect(mockServices.s3Client.send.calledOnce).to.be.true;
      expect(result.finalUrl).to.equal('https://example.com');
      expect(result.scrapeTime).to.be.a('number');
      expect(result.scrapedAt).to.be.a('number');
      expect(result.location).to.equal('scrapes/test-job-id/scrape.json');
      expect(result.userAgent).to.equal('test-user-agent');
      expect(result.scrapeResult).to.deep.equal(scrapeResult);
      expect(mockServices.s3Client.send.calledOnce).to.be.true;
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
