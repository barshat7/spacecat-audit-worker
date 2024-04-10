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

import puppeteer from 'puppeteer-core';

import { getPrompt } from '../../support/utils.js';

const scrapeURL = async (url, firefallClient, slackClient, log) => {
  const { channelId, threadId } = await slackClient.postMessage({
    channel: 'C06HUH04FJ6',
    unfurl_links: false,
    text: `Started Scraping URL ${url} :thread:`,
  });

  const startScrape = Date.now();

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(
      process.env.AWS_EXECUTION_ENV
        ? '/opt/nodejs/node_modules/@sparticuz/chromium/bin'
        : undefined,
    ),
    headless: chromium.headless,
  });

  log.info('Browser Launched');

  // Open a new page
  const page = await browser.newPage();

  await page.goto(url, {
    // Wait until the HTML is ready
    waitUntil: 'domcontentloaded',
  });

  log.info(`Page Loaded: ${url}`);

  // The anonymous function is executed in the browser context
  // eslint-disable-next-line no-unused-vars
  const paragraphs = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const mainDiv = document.querySelector('main');
    if (!mainDiv) {
      return 'No main div found';
    }

    const elementsToRemove = mainDiv.querySelectorAll('picture, svg, img, object, video, embed, iframe, audio, frame, script, link, meta, style');
    elementsToRemove.forEach((el) => el.remove());

    let textContent = mainDiv.textContent || '';

    // Remove all whitespace (convert multiple spaces to one space)
    textContent = textContent.replace(/\s+/g, ' ');

    // Remove all leading and trailing whitespace from each line
    textContent = textContent.split('\n').map((line) => line.trim()).join('\n');

    // Remove all empty lines
    textContent = textContent.split('\n').filter((line) => line).join('\n');

    // Replace all non-ascii spaces with regular spaces
    textContent = textContent.replace(/[^\u0020-\u007E]/g, ' ');

    return textContent;
  });

  // Closing the browser
  await browser.close();

  const endScrape = Date.now();
  const scrapeTime = endScrape - startScrape;

  log.info(`Time taken for scraping: ${scrapeTime}ms`);

  await slackClient.postMessage({
    channel: channelId,
    thread_ts: threadId,
    unfurl_links: false,
    text: `Scraped URL ${url} in ${scrapeTime}ms. Sending content to Firefall... :loading:`,
  });

  const firefallStartTime = Date.now();
  const prompt = await getPrompt({ content: paragraphs }, log);

  log.info('Prompt:', prompt);

  const firefallResult = await firefallClient.fetch(prompt);
  const firefallEndTime = Date.now();
  const firefallTime = firefallEndTime - firefallStartTime;

  log.info(`Time taken for Firefall: ${firefallTime}ms`);

  await slackClient.postMessage({
    channel: channelId,
    thread_ts: threadId,
    text: `Fetched content from Firefall in ${firefallTime}ms.`,
  });

  await slackClient.postMessage({
    channel: channelId,
    thread_ts: threadId,
    text: `Sending Message to SQS:\n\`\`\`\n${firefallResult}\n\`\`\``,
  });

  const result = JSON.parse(firefallResult);

  result.metadata.finalUrl = url;
  result.metadata.scrapeStartAt = new Date(startScrape).toISOString();
  result.metadata.scrapeEndAt = new Date(endScrape).toISOString();

  return result;
};

export default scrapeURL;
