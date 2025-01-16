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

// eslint-disable-next-line import/no-extraneous-dependencies
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export const SCREENSHOT_TYPES = {
  VIEWPORT: 'viewport', // Above fold (visible viewport only)
  SECTION: 'section', // Auto-detected sections in the DOM
  BLOCK: 'block', // Auto-detected blocks in the DOM
  FULL_PAGE: 'fullpage', // Entire page
  THUMBNAIL: 'thumbnail', // Thumbnail version of the page
  SCROLL: 'scroll', // Scroll the page and take screenshots at each scroll depth
};

const DEFAULT_SECTION_LOAD_WAIT_TIME = 3000;
const SCROLL_SCREENSHOT_COUNT = 2;

async function takePageScreenshot(page, deviceName, screenshotType, segment, log) {
  let screenshot;
  const pageScreenshotSubsegment = segment.addNewSubsegment(`Taking ${screenshotType} Screenshot`);
  try {
    const startScreenshot = Date.now();
    const screenshotBinary = await page.screenshot({
      fullPage: screenshotType === SCREENSHOT_TYPES.FULL_PAGE,
      type: 'png',
      encoding: 'binary',
    });
    const endScreenshot = Date.now();
    const screenshotTime = endScreenshot - startScreenshot;
    screenshot = {
      fileName: `screenshot-${deviceName}-${screenshotType}.png`, binary: screenshotBinary, contentType: 'image/png', screenshotTime,
    };
    pageScreenshotSubsegment.close();
  } catch (e) {
    log.error(`Error taking screenshot: ${e.message}`, e);
    pageScreenshotSubsegment.addError(e);
    pageScreenshotSubsegment.close();
  }
  return screenshot;
}

async function takeThumbnailScreenshot(page, deviceName, fullPageScreenshotBinary, segment, log) {
  // Crop and resize screenshot into thumbnail
  let thumbnail;
  const thumbnailSubsegment = segment.addNewSubsegment('Generating Thumbnail');
  try {
    const startThumbnail = Date.now();
    const thumbnailBinary = await sharp(fullPageScreenshotBinary)
      .toFormat('png')
      .extract({
        left: 0,
        top: 0,
        width: page.viewport().width,
        height: page.viewport().height,
      })
      .resize(200)
      .toBuffer();
    const endThumbnail = Date.now();
    const thumbnailTime = endThumbnail - startThumbnail;
    thumbnail = {
      fileName: `screenshot-${deviceName}-thumbnail.png`, binary: thumbnailBinary, contentType: 'image/png', screenshotTime: thumbnailTime,
    };
    thumbnailSubsegment.close();
  } catch (e) {
    log.error(`Error generating thumbnail: ${e.message}`, e);
    thumbnailSubsegment.addError(e);
    thumbnailSubsegment.close();
  }
  return thumbnail;
}

function orderClasses(classAttribute) {
  const classes = classAttribute.split(' ');
  if (classes.length === 0 || classes.length === 1) {
    return classAttribute;
  }
  const blockName = classes[0]; // First class is the block name
  const variations = classes.slice(1).sort(); // Rest are variations, sorted alphabetically
  return `${blockName} ${variations.join(' ')}`;
}

async function takeElementScreenshots(page, deviceName, type, segment, options, log) {
  const { sectionLoadWaitTime = DEFAULT_SECTION_LOAD_WAIT_TIME } = options;
  const elementScreenshots = [];
  const elementClassNames = [];
  let elementClassNameCounter = 1;
  const elementSubsegment = segment.addNewSubsegment(`Taking ${type} Screenshots`);
  const utilityFunctions = await fs.promises.readFile(path.resolve('./static/evaluate/page-elements.js'), 'utf8');
  // sections may take little time to load, so wait for those
  await new Promise((resolve) => {
    setTimeout(resolve, sectionLoadWaitTime);
  });
  // eslint-disable-next-line no-undef
  const elementInfos = await page.evaluate(`
    // Execute and return result
    (function(type) {
      ${utilityFunctions}

      try {
        const result = type === 'section'
          ? getEDSSections(document)
          : getEDSBlocks(document);
        return result;
      } catch (err) {
        return [];
      }
    })('${type}')
  `);
  log.info(`Found ${elementInfos.length} ${type}s`);
  for (const elementInfo of elementInfos) {
    try {
      log.info(`processing element: ${elementInfo.path} ${elementInfo.tagName} ${elementInfo.className}`);
      // Get element using its unique path
      // eslint-disable-next-line no-await-in-loop
      const element = await page.$(elementInfo.path);
      if (!element) {
        log.warn(`Could not find element with path: ${elementInfo.path}`);
        // eslint-disable-next-line no-continue
        continue;
      }
      // Verify we got the right element
      // eslint-disable-next-line no-await-in-loop
      const verifyElement = await element.evaluate((el, info) => ({
        matches: el.className === info.className
          && el.tagName === info.tagName
            && Array.from(el.parentNode.children).indexOf(el) === info.index,
      }), elementInfo);

      if (!verifyElement.matches) {
        log.warn('Selected element does not match original element properties');
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await element.evaluate((el) => new Promise((resolve) => {
        el.scrollIntoView({
          behavior: 'instant',
        });
        /**
         * explicitly using instant scroll behavior,
         * using 0 so that the scroll will be done as soon as navigator completes current task
         */
        setTimeout(resolve, 0);
      }));
      // eslint-disable-next-line no-await-in-loop
      const boundingBox = await element.boundingBox();
      if (!boundingBox || boundingBox.width === 0 || boundingBox.height === 0) {
        log.warn(`Skipping ${type} screenshot for ${elementInfo.path} because it has no bounding box`);
        // eslint-disable-next-line no-continue
        continue;
      }
      const startScreenshot = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const screenshotBinary = await page.screenshot({
        type: 'png',
        encoding: 'binary',
      });
      const endScreenshot = Date.now();
      const screenshotTime = endScreenshot - startScreenshot;
      // eslint-disable-next-line no-await-in-loop
      let elementClassName = await element.evaluate((el) => el.getAttribute('class'));
      elementClassName = orderClasses(elementClassName || '');
      elementClassName = elementClassName?.replace(/\s+/g, '_') || '';
      if (elementClassName && elementClassNames.includes(elementClassName)) {
        elementClassName = `${elementClassName}_${elementClassNameCounter}`;
        elementClassNameCounter += 1;
      }
      elementClassNames.push(elementClassName);
      log.info(`Queuing ${type} screenshot for device ${deviceName} --> ${elementInfo.path} ${elementInfo.tagName} ${elementInfo.className}`);
      elementScreenshots.push({
        folder: type,
        fileName: `screenshot-${deviceName}-${type}-${elementInfo.tagName?.toLowerCase()}-${elementClassName}.png`,
        binary: screenshotBinary,
        contentType: 'image/png',
        screenshotTime,
      });
      elementSubsegment.close();
    } catch (e) {
      log.error(`Error taking ${type} screenshot: ${e.message}`, e);
      elementSubsegment.addError(e);
      elementSubsegment.close();
    }
  }
  return elementScreenshots;
}

async function takeScrollScreenshots(page, deviceName, segment, log) {
  const scrollScreenshots = [];
  const scrollSubsegment = segment.addNewSubsegment('Taking Scroll Screenshots');
  // eslint-disable-next-line no-await-in-loop
  for (let i = 1; i <= SCROLL_SCREENSHOT_COUNT; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate((scrollIndex) => new Promise((resolve) => {
        // eslint-disable-next-line no-undef
        window.scrollTo({
          left: 0,
          // eslint-disable-next-line no-undef
          top: scrollIndex * window.innerHeight,
          behavior: 'instant',
        });
        /**
         * explicitly using instant scroll behavior,
         * using 0 so that the scroll will be done as soon as navigator completes current task
         */
        setTimeout(resolve, 0);
      }), i);
      const startScreenshot = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const screenshotBinary = await page.screenshot({
        type: 'png',
        encoding: 'binary',
      });
      const endScreenshot = Date.now();
      const screenshotTime = endScreenshot - startScreenshot;
      scrollScreenshots.push({
        folder: 'scroll',
        fileName: `screenshot-${deviceName}-scroll-${i}.png`,
        binary: screenshotBinary,
        contentType: 'image/png',
        screenshotTime,
      });
      scrollSubsegment.close();
    } catch (e) {
      log.error(`Error taking scroll screenshot: ${e.message}`, e);
      scrollSubsegment.addError(e);
      scrollSubsegment.close();
    }
  }
  scrollSubsegment.close();
  return scrollScreenshots;
}

/**
 * Take screenshots of the page
 * @param {object} services - The services object containing xray and log
 * @param {Page} page - The page to take screenshots of
 * @param {string} device - The device to take screenshots of
 * @param {object} options - The options to override default behavior
 * @param {string[]} options.screenshotTypes - The types of screenshots to take
 * @param {number} options.sectionLoadWaitTime - The wait time for sections to load
 * @returns {Promise<object[]>} The screenshots
 */
export async function takeScreenshots(services, page, device, options) {
  const screenshots = [];
  const { log } = services;
  const { screenshotTypes } = options;
  const deviceName = device.replace(/\s/g, '-').toLowerCase();
  const segment = services.xray.getSegment() || new services.xray.Segment('Screenshots');
  if (screenshotTypes.includes(SCREENSHOT_TYPES.VIEWPORT)) {
    screenshots.push(
      await takePageScreenshot(page, deviceName, SCREENSHOT_TYPES.VIEWPORT, segment, log),
    );
  }
  if (screenshotTypes.includes(SCREENSHOT_TYPES.FULL_PAGE)) {
    const fullPageScreenshot = await takePageScreenshot(
      page,
      deviceName,
      SCREENSHOT_TYPES.FULL_PAGE,
      segment,
      log,
    );
    screenshots.push(fullPageScreenshot);
    if (fullPageScreenshot?.binary && screenshotTypes.includes(SCREENSHOT_TYPES.THUMBNAIL)) {
      screenshots.push(
        await takeThumbnailScreenshot(page, deviceName, fullPageScreenshot.binary, segment, log),
      );
    }
  }
  if (screenshotTypes.includes(SCREENSHOT_TYPES.SECTION)) {
    screenshots.push(
      ...await takeElementScreenshots(
        page,
        deviceName,
        SCREENSHOT_TYPES.SECTION,
        segment,
        options,
        log,
      ),
    );
  }
  if (screenshotTypes.includes(SCREENSHOT_TYPES.BLOCK)) {
    screenshots.push(
      ...await takeElementScreenshots(
        page,
        deviceName,
        SCREENSHOT_TYPES.BLOCK,
        segment,
        options,
        log,
      ),
    );
  }
  if (screenshotTypes.includes(SCREENSHOT_TYPES.SCROLL)) {
    screenshots.push(
      ...await takeScrollScreenshots(page, deviceName, segment, log),
    );
  }
  return screenshots.filter(Boolean);
}
