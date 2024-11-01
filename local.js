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

/* eslint-disable no-console */
import './src/index.js';
import fs from 'fs';
import path from 'path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import DefaultHandler from './src/handlers/default-handler.js';

// Render multiple times if device is more than one, take screenshot for each
(async () => {
  const config = {
    jobId: 'test-job-id',
    s3BucketName: 'test-bucket',
    completionQueueUrl: 'https://sqs.test.com/queue',
    slackContext: {
      threadTs: '12345.67890',
      channelId: 'C12345678',
    },
    skipStorage: false,
    options: {
      takeScreenshot: true,
      generateThumbnail: true,
    },
    // device: {},
  };
  const services = {
    log: {
      debug: (...args) => console.debug('log.debug:', ...args),
      info: (...args) => console.info('log.info:', ...args),
      error: (...args) => console.error('log.error:', ...args),
    },
    sqsClient: {
      sendMessage: (params) => {
        console.log('sqsClient.sendMessage:', params);
        return { promise: () => Promise.resolve() };
      },
    },
    s3Client: {
      middlewareStack: {
        remove: () => {},
        use: () => {},
      },
      send: async (command) => {
        if (command instanceof PutObjectCommand) {
          // Write file to tmp folder
          const targetPath = path.join('tmp', command.input.Key);
          // If folder structure does not exist, create it
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.writeFileSync(path.join('tmp', command.input.Key), command.input.Body);
          return Promise.resolve();
        } else if (command instanceof GetObjectCommand) {
          const error = new Error('The specified key does not exist.');
          error.name = 'NoSuchKey';
          return Promise.reject(error);
        } else {
          return Promise.reject(new Error('Unsupported command'));
        }
      },
    },
    slackClient: {
      postMessage: (params) => {
        console.log('slackClient.postMessage:', params);
        return { promise: () => Promise.resolve() };
      },
    },
  };
  const handler = new DefaultHandler(config, services);

  const urlsData = [
    { url: 'https://www.aemshop.net' }, // https://www.w3schools.com/cssref/css_websafe_fonts.php
  ];

  await handler.process(urlsData, {}, config.options);
  console.log('processing done');
})();
