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

// This dependency is provided via AWS layers as an external (see package.json wsk config)
// eslint-disable-next-line import/no-extraneous-dependencies
import chromium from '@sparticuz/chromium';

/**
 * The following dependencies are provided via AWS layers as externals
 * (see package.json wsk config).
 * Therefore, we have eslint ignore these dependencies.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { KnownDevices } from 'puppeteer-core';
// eslint-disable-next-line import/no-extraneous-dependencies
import puppeteer from 'puppeteer-extra';
// eslint-disable-next-line import/no-extraneous-dependencies
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// eslint-disable-next-line import/no-extraneous-dependencies
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const iPhone13Pro = KnownDevices['iPhone 13 Pro'];

async function evalFn() {
  /* eslint-disable no-undef */
  const { body } = document;

  try {
    if (!body) {
      throw new Error('No body element found');
    }

    const elementsToRemove = body.querySelectorAll('picture, svg, img, object, video, embed, iframe, audio, frame, script, link, meta, style');
    elementsToRemove.forEach((el) => el.remove());

    const rawBody = body.innerHTML;

    if (!rawBody) {
      throw new Error('No innerHTML found in body element');
    }

    let textContent = body.textContent || '';

    // Remove all whitespace (convert multiple spaces to one space)
    textContent = textContent.replace(/\s+/g, ' ');

    // Remove all leading and trailing whitespace from each line
    textContent = textContent.split('\n')
      .map((line) => line.trim())
      .join('\n');

    // Remove all empty lines
    textContent = textContent.split('\n')
      .filter((line) => line)
      .join('\n');

    // Replace all non-ascii spaces with regular spaces
    textContent = textContent.replace(/[^\u0020-\u007E]/g, ' ');

    return {
      rawBody,
      textContent,
    };
  } catch (e) {
    return {
      error: e.message,
      rawBody: '',
      textContent: '',
    };
  }
}

export async function scrape(url, log, useMobileDevice = true) {
  const startScrape = Date.now();

  const isLocal = process.env.AWS_EXECUTION_ENV === undefined;
  const options = isLocal ? {
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    // install with: brew install chromium --no-quarantine
    executablePath: '/opt/homebrew/bin/chromium',
    headless: true,
  } : {
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath('/opt/nodejs/node_modules/@sparticuz/chromium/bin'),
    headless: chromium.headless,
  };

  const browser = await puppeteer.launch(options);

  log.info('Browser Launched');

  const page = await browser.newPage();

  if (useMobileDevice) {
    await page.emulate(iPhone13Pro);
  }

  await page.goto(url, {
    waitUntil: 'networkidle2',
  });

  await page.waitForSelector('body', { timeout: 60000 });

  log.info(`Page Loaded: ${url}`);

  // The anonymous function is executed in the browser context
  const result = await page.evaluate(evalFn);

  await browser.close();

  const endScrape = Date.now();
  const scrapeTime = endScrape - startScrape;

  log.info(`Time taken for scraping: ${scrapeTime}ms`);

  return {
    ...result,
    scrapeTime,
    scrapedAt: endScrape,
  };
}
