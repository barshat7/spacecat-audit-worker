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

import { md2docx } from '@adobe/helix-md2docx';
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import sharp from 'sharp';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import AbstractHandler from './abstract-handler.js';
import RedirectError from '../support/redirect-error.js';

/**
 * Handler for import as a service URLs.
 */
const DOCX_STYLES_XML_PATH = './static/resources/import/styles.xml';

class ImportHandler extends AbstractHandler {
  static handlerName = 'import';

  s3KeyPrefix = 'imports';

  constructor(config, services) {
    super(
      ImportHandler.handlerName,
      config,
      services,
    );

    this.importPath = null;
    this.urlId = config.urlId;
  }

  /**
   * Return the contents of the file being requested from the S3 bucket.
   * @param stream {ReadableStream} The stream to read
   * @return {Promise<*>} The contents of the asset
   */
  static async #readStreamContents(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }

  /**
   * Return the contents of the file being requested from the S3 bucket.
   * @param assetName {string} The name of the asset to retrieve
   * @return {Promise<*|null>} The contents of the asset, or null if the asset does not exist.
   */
  async getS3JobAsset(assetName) {
    try {
      // Check for import.js in the S3 bucket
      const command = new GetObjectCommand({
        Bucket: this.config.s3BucketName,
        Key: `${this.s3KeyPrefix}/${this.config.jobId}/${assetName}`,
      });
      const response = await this.s3Client.send(command);

      // The response.Body is a ReadableStream
      return ImportHandler.#readStreamContents(response.Body);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        // No custom import.js file found - no-op
        this.log('info', `There is no import.js file in bucket: ${this.config.s3BucketName}`);
        return null;
      } else {
        this.log('error', `Error retrieving import.js from bucket: ${this.config.s3BucketName}`, error);
        throw error;
      }
    }
  }

  /**
   * In the import case, we first check the S3 bucket for the presence of a client-provided
   * import.js file. If it exists, stream the contents of the file into a string and return it.
   * @returns {Promise<string|null>} Either the string contents of the file, or null.
   */
  async getCustomInjectCode() {
    return this.getS3JobAsset('import.js');
  }

  // force convert all images to png
  async #image2png({ src, data }) {
    try {
      const png = (await sharp(data)).png();
      const metadata = await png.metadata();
      return {
        data: png.toBuffer(),
        width: metadata.width,
        height: metadata.height,
        type: 'image/png',
      };
    } catch (e) {
      this.log('error', `Cannot convert image ${src} to png. It might corrupt the Word document and you should probably remove it from the DOM.`);
      return null;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  getScriptPath() {
    return path.resolve('./static/evaluate/import.js');
  }

  async getStoragePath() {
    return path.join(`${this.s3KeyPrefix}/${this.config.jobId}/docx`, `${this.importPath}.docx`);
  }

  /**
   * Validates the response for a given URL to check if it was redirected.
   * In the import case, throws a RedirectError if requesting the URL resulted in a redirect.
   *
   * @param {string} originalUrl - The original URL that was requested.
   * @param {object} response - The response object from the request.
   * @throws {RedirectError} If the URL was redirected to a different URL.
   */
  // eslint-disable-next-line class-methods-use-this
  validateResponseForUrl(originalUrl, response) {
    super.validateResponseForUrl(originalUrl, response);
    const redirectChain = response?.request()?.redirectChain();
    const isRedirected = redirectChain && redirectChain.length > 0;
    const isUrlChanged = response?.url() !== originalUrl;

    if (isRedirected && isUrlChanged) {
      throw new RedirectError(`Redirected to ${response.url()} from ${originalUrl}`);
    }
  }

  async transformScrapeResult(result) {
    const { md, path: impPath } = result.scrapeResult;

    // save path for later use
    this.importPath = impPath;

    // read styles.xml file
    const stylesXML = fs.readFileSync(path.resolve(DOCX_STYLES_XML_PATH), 'utf-8');

    // convert markdown to docx
    return md2docx(md, {
      stylesXML,
      image2png: this.#image2png,
      log: this.services.log,
      customHeaders: this.customHeaders,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  getStorageConfig() {
    return {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
    };
  }

  static accepts(processingType) {
    return processingType === ImportHandler.handlerName;
  }
}

export default ImportHandler;
