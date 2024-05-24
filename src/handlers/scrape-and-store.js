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

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { scrape } from '../../support/scrape.js';
import { sendSlackMessage } from '../../support/utils.js';

const store = async (url, jobId, content, s3Client, s3BucketName, log) => {
  const filePath = `scrapes/${jobId}/scrape.json`;

  const command = new PutObjectCommand({
    Bucket: s3BucketName,
    Key: filePath,
    Body: JSON.stringify(content, null, 2),
    ContentType: 'application/json',
  });

  const response = await s3Client.send(command);
  log.info(`Successfully uploaded to ${filePath}. Response: ${JSON.stringify(response)}`);

  return filePath;
};

const scrapeAndStore = async (finalUrl, jobId, context, slackContext) => {
  const { log } = context;

  const s3Client = new S3Client();

  try {
    const desktopScrape = await scrape(finalUrl, log, false);
    const mobileScrape = await scrape(finalUrl, log, true);

    const scrapeResult = {
      desktop: desktopScrape,
      mobile: mobileScrape,
      finalUrl,
    };

    const result = await store(
      finalUrl,
      jobId,
      scrapeResult,
      s3Client,
      process.env.S3_BUCKET_NAME,
      log,
    );

    return { s3Key: result };
  } catch (error) {
    log.error(`Failed to scrape. Error: ${error}`, error);
    await sendSlackMessage(context, slackContext, `Failed to scrape with error: ${error}`);
    throw error;
  }
};

export default scrapeAndStore;
