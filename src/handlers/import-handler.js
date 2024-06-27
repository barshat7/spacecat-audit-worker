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

import AbstractHandler from './abstract-handler.js';

/**
 * Handler for import as a service URLs.
 */

const DOCX_STYLES_XML_PATH = './static/resources/import/styles.xml';

class ImportHandler extends AbstractHandler {
  static handlerName = 'import';

  constructor(config, services) {
    super(
      ImportHandler.handlerName,
      config,
      services,
    );

    this.importPath = null;
    this.urlId = config.urlId;
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

  async getStoragePath() {
    return path.join(`imports/${this.config.jobId}/docx`, `${this.importPath}.docx`);
  }

  /* eslint-disable-next-line class-methods-use-this */
  async transformScrapeResult(result) {
    const { md, path: impPath } = result.scrapeResult;

    // save path for later use
    this.importPath = impPath;

    // read styles.xml file
    const stylesXML = fs.readFileSync(path.resolve(DOCX_STYLES_XML_PATH), 'utf-8');

    // convert markdown to docx
    const docx = await md2docx(md, {
      stylesXML,
      image2png: this.#image2png,
      log: this.services.log,
    });

    return docx;
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
