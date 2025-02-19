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

/**
 * @typedef {import("@smithy/types").StreamingBlobPayloadInputTypes} StreamingBlobPayloadInputTypes
 */

import { md2jcr } from '@adobe/helix-md2jcr';
import path from 'path';
import fs from 'fs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import ImportHandler from './import-handler.js';

class XWalkImportHandler extends ImportHandler {
  static HANDLER_NAME = 'import-xwalk';

  constructor(config, services) {
    super(config, services);
    this.handlerName = 'import-xwalk';
  }

  async transformScrapeResult(result) {
    this.log('info', 'Retrieving component models, filters, and definition from S3');

    const { md } = result.scrapeResult;

    this.importPath = new URL(result.finalUrl).pathname;
    if (this.importPath === '/') {
      this.importPath = 'index';
    }

    await this.storeAsset(md, `${this.importPath}.md`);

    const models = await this.getS3JobAsset('component-models.json');
    const filters = await this.getS3JobAsset('component-filters.json');
    const definition = await this.getS3JobAsset('component-definition.json');

    this.log('info', 'Transforming scrape result to JCR XML');
    return md2jcr(md, {
      models: JSON.parse(models),
      definition: JSON.parse(definition),
      filters: JSON.parse(filters),
    });
  }

  /**
   * Store the data in s3's job bucket.
   * @param {StreamingBlobPayloadInputTypes} data - The data to write to the s3 file.
   * @param {string} fileName - The name of the asset to store
   * @return {Promise<void>} A promise that resolves when the file is stored
   */
  async storeAsset(data, fileName) {
    // store the markdown file in S3
    const mdFile = path.join(`${this.s3KeyPrefix}/${this.config.jobId}/jcr`, fileName);
    const command = new PutObjectCommand({
      Bucket: this.config.s3BucketName,
      Key: mdFile,
      Body: data,
      ContentType: 'text/markdown; charset=utf-8',
    });
    return this.s3Client.send(command);
  }

  // eslint-disable-next-line class-methods-use-this
  getPageInjectCode() {
    const handlerScriptPath = path.resolve('./static/inject/import.js');
    if (fs.existsSync(handlerScriptPath)) {
      return fs.readFileSync(handlerScriptPath, 'utf8');
    }
    throw new Error(`${this.getName()}'s inject script not found at ${handlerScriptPath}`);
  }

  /**
   * Store the result of the scrape in S3 as a xml file.
   * @return {Promise<string>}
   */
  async getStoragePath() {
    return path.join(`${this.s3KeyPrefix}/${this.config.jobId}/jcr`, `${this.importPath}.xml`);
  }

  // eslint-disable-next-line class-methods-use-this
  getStorageConfig() {
    return {
      contentType: 'application/xml',
      extension: 'xml',
    };
  }

  static accepts(processingType) {
    return processingType === XWalkImportHandler.HANDLER_NAME;
  }
}

export default XWalkImportHandler;
