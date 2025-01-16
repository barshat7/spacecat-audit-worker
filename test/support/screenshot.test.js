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
import esmock from 'esmock';
import { SCREENSHOT_TYPES } from '../../src/support/screenshot.js';

describe('screenshot.js tests', () => {
  let mockPage;
  let mockServices;
  let mockLog;
  let sharpStub;
  let takeScreenshots;

  beforeEach(async () => {
    // Mock sharp
    sharpStub = sinon.stub().returns({
      toFormat: sinon.stub().returnsThis(),
      extract: sinon.stub().returnsThis(),
      resize: sinon.stub().returnsThis(),
      toBuffer: sinon.stub().resolves(Buffer.from('fake-thumbnail')),
    });

    // Generic element evaluate stub that handles different cases based on the callback's toString()
    const elementEvaluateStub = sinon.stub().callsFake((callback, info) => {
      // Identify the operation based on the callback's toString()
      const callbackStr = callback.toString();
      if (callbackStr.includes('scrollIntoView')) {
        // Handle scrolling case
        const mockElement = {
          scrollIntoView: () => {},
        };
        return callback(mockElement, 0);
      } else if (callbackStr.includes('getAttribute')) {
        // Handle class attribute case
        return callback({
          getAttribute: () => 'block test-class',
        });
      } else {
        // Handle element verification case (default)
        const mockElement = {
          className: 'block test-class',
          tagName: 'div',
        };
        mockElement.parentNode = {
          children: [mockElement],
        };
        return callback(mockElement, info);
      }
    });

    mockPage = {
      screenshot: sinon.stub().resolves(Buffer.from('fake-screenshot')),
      waitForTimeout: sinon.stub().resolves(),
      viewport: sinon.stub().returns({ width: 1024, height: 768 }),
      $: sinon.stub().resolves({
        evaluate: elementEvaluateStub,
        boundingBox: sinon.stub().resolves({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        }),
      }),
    };

    // Mock logger
    mockLog = {
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
    };

    mockServices = {
      xray: {
        getSegment: sinon.stub(),
        Segment: sinon.stub().returns({
          addNewSubsegment: sinon.stub().returns({
            addError: sinon.stub(),
            close: sinon.stub(),
          }),
        }),
      },
      log: mockLog,
    };

    // Mock page evaluate for scroll operations
    mockPage.evaluate = sinon.stub().callsFake((script, ...args) => {
      const scriptStr = script.toString();
      if (scriptStr.includes('getEDSSections')) {
        // Handle the utility functions evaluation
        return [
          {
            path: '#test-element',
            tagName: 'div',
            className: 'block test-class',
            index: 0,
          },
        ];
      } else if (scriptStr.includes('window.scrollTo')) {
        // Handle scroll operations
        const mockWindow = {
          scrollTo: sinon.stub(),
          innerHeight: 800,
        };
        // Create a mock global window object
        global.window = mockWindow;
        // Execute the callback with our mock window
        return script(...args);
      }
      // Default return value for any other case
      return Promise.resolve();
    });

    // Mock the screenshot module using esmock
    const screenshotModule = await esmock('../../src/support/screenshot.js', {
      sharp: sharpStub,
      fs: {
        promises: {
          readFile: sinon.stub().resolves('mock utility functions'),
        },
      },
    });

    takeScreenshots = screenshotModule.takeScreenshots;
  });

  afterEach(() => {
    // Clean up global window mock
    delete global.window;
    sinon.restore();
  });

  it('takes viewport screenshot', async () => {
    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.VIEWPORT],
    });

    expect(result).to.have.lengthOf(1);
    expect(result[0].fileName).to.include(SCREENSHOT_TYPES.VIEWPORT);
    expect(mockPage.screenshot.calledOnce).to.be.true;
    expect(mockPage.screenshot.calledWith({
      fullPage: false,
      type: 'png',
      encoding: 'binary',
    })).to.be.true;
  });

  it('takes full page screenshot with thumbnail', async () => {
    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.FULL_PAGE, SCREENSHOT_TYPES.THUMBNAIL],
    });

    expect(result).to.have.lengthOf(2);
    expect(result[0].fileName).to.include(SCREENSHOT_TYPES.FULL_PAGE);
    expect(result[1].fileName).to.include(SCREENSHOT_TYPES.THUMBNAIL);

    // Verify sharp was called with correct parameters
    expect(sharpStub.calledOnce).to.be.true;
    const sharpInstance = sharpStub.firstCall.returnValue;
    expect(sharpInstance.toFormat.calledWith('png')).to.be.true;
    expect(sharpInstance.extract.calledWith({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
    })).to.be.true;
    expect(sharpInstance.resize.calledWith(200)).to.be.true;
    expect(sharpInstance.toBuffer.calledOnce).to.be.true;
  });

  it('takes section screenshots', async () => {
    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.SECTION],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(1);
    expect(result[0].fileName).to.include(SCREENSHOT_TYPES.SECTION);
  });

  it('takes block screenshots', async () => {
    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.BLOCK],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(1);
    expect(result[0].fileName).to.include(SCREENSHOT_TYPES.BLOCK);
  });

  it('takes scroll screenshots', async () => {
    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.SCROLL],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(2); // 2 scroll positions
    expect(result[0].fileName).to.include(SCREENSHOT_TYPES.SCROLL);
    expect(result[1].fileName).to.include(SCREENSHOT_TYPES.SCROLL);
  });

  it('handles screenshot errors gracefully', async () => {
    mockPage.screenshot.rejects(new Error('Screenshot failed'));

    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.VIEWPORT, SCREENSHOT_TYPES.BLOCK, SCREENSHOT_TYPES.SCROLL],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(0);
    expect(mockLog.error.callCount).to.be.equal(4); // 2 screenshots for scroll type
  });

  it('handles missing elements for section/block screenshots', async () => {
    mockPage.$.resolves(null);

    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.SECTION],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(0);
    expect(mockLog.warn.calledWith(sinon.match(/Could not find element/))).to.be.true;
  });

  it('handles element verification failures', async () => {
    mockPage.$.resolves({
      evaluate: sinon.stub().callsFake((callback, info) => {
        // Mock element with different properties to force mismatch
        const mockElement = {
          className: 'different-class',
          tagName: 'SPAN',
          parentNode: {
            children: [], // Initialize empty array first
          },
        };
        // Add the element to children after it's fully defined
        mockElement.parentNode.children.push(mockElement);

        return callback(mockElement, info);
      }),
      boundingBox: sinon.stub().resolves({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }),
    });

    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.BLOCK],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(0);
    expect(mockLog.warn.calledWith('Selected element does not match original element properties')).to.be.true;
  });

  it('handles elements with no bounding box', async () => {
    mockPage.$.resolves({
      evaluate: sinon.stub().resolves({ matches: true }),
      boundingBox: sinon.stub().resolves(null),
    });

    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.SECTION],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(0);
    expect(mockLog.warn.calledWith(sinon.match(/no bounding box/))).to.be.true;
  });

  it('handles multiple class names in elements', async () => {
    const childNodes = [
      {
        path: '#test1',
        tagName: 'div',
        className: 'block test-class',
        index: 0,
      },
      {
        path: '#test2',
        tagName: 'div',
        className: 'block test-class',
        index: 1,
      },
    ];
    mockPage.evaluate.resolves(childNodes);

    const elementEvaluateStub = sinon.stub().callsFake((callback, info) => {
      // Identify the operation based on the callback's toString()
      const callbackStr = callback.toString();

      if (callbackStr.includes('scrollIntoView')) {
        // Handle scrolling case
        return Promise.resolve();
      } else if (callbackStr.includes('getAttribute')) {
        // Handle class attribute case
        return callback({
          getAttribute: () => 'block test-class',
        });
      } else {
        // Handle element verification case (default)
        childNodes[0].parentNode = {
          children: childNodes,
        };
        childNodes[1].parentNode = {
          children: childNodes,
        };
        if (info.path === '#test1') {
          return callback(childNodes[0], info);
        } else {
          return callback(childNodes[1], info);
        }
      }
    });
    mockPage.$.resolves({
      evaluate: elementEvaluateStub,
      boundingBox: sinon.stub().resolves({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }),
    });

    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.BLOCK],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(2);
    expect(result[0].fileName).to.include('block_test-class');
    expect(result[1].fileName).to.include('block_test-class_1');
  });

  it('handles missing class attribute in section screenshot', async () => {
    const elementEvaluateStub = sinon.stub().callsFake((callback, info) => {
      // Identify the operation based on the callback's toString()
      const callbackStr = callback.toString();

      if (callbackStr.includes('scrollIntoView')) {
        // Handle scrolling case
        return Promise.resolve();
      } else if (callbackStr.includes('getBoundingClientRect')) {
        return Promise.resolve();
      } else if (callbackStr.includes('getAttribute')) {
        // Handle class attribute case
        return callback({
          getAttribute: () => undefined,
        });
      } else {
        // Handle element verification case (default)
        const mockElement = {
          className: 'block test-class',
          tagName: 'div',
        };
        mockElement.parentNode = {
          children: [mockElement],
        };
        return callback(mockElement, info);
      }
    });
    mockPage.$.resolves({
      evaluate: elementEvaluateStub,
      boundingBox: sinon.stub().resolves({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }),
    });

    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.SECTION],
      sectionLoadWaitTime: 10,
    });

    expect(result).to.have.lengthOf(1);
    expect(result[0].fileName).to.include(SCREENSHOT_TYPES.SECTION);
  });

  it('handles thumbnail generation errors', async () => {
    sharpStub.throws(new Error('Sharp processing failed'));

    const result = await takeScreenshots(mockServices, mockPage, 'desktop', {
      screenshotTypes: [SCREENSHOT_TYPES.FULL_PAGE, SCREENSHOT_TYPES.THUMBNAIL],
    });

    expect(result).to.have.lengthOf(1); // Only full page screenshot, thumbnail failed
    expect(result[0].fileName).to.include(SCREENSHOT_TYPES.FULL_PAGE);
    expect(mockLog.error.calledWith(sinon.match(/Error generating thumbnail/))).to.be.true;
  });
});
