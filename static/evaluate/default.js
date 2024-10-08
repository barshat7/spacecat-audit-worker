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

const evalFn = () => {
  /* eslint-disable no-undef */
  const { document } = window;
  try {
    const { body } = document;
    if (!body) {
      throw new Error('No body element found');
    }

    const titleTag = document.querySelector('title');
    const tags = {
      ...(titleTag && titleTag.textContent ? { title: titleTag.textContent } : {}),
      h1: []
    };
    // Get description from meta tag
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      tags.description = metaDescription.getAttribute('content') || '';
    }

    // Get all h1 tags
    const h1Tags = document.querySelectorAll('h1');
    tags.h1 = Array.from(h1Tags).map(tag => tag.textContent);

    const elementsToRemove = body.querySelectorAll('iframe, frame, script, link, meta, style');
    elementsToRemove.forEach((el) => el.remove());

    const rawBody = body.outerHTML.replace(/\n/g, '');
    if (!rawBody) {
      throw new Error('No outerHTML found in body element');
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
      tags
    };
  } catch (e) {
    return {
      error: e.message,
      rawBody: '',
      textContent: '',
      tags: {
        h1: []
      }
    };
  }
};

evalFn();
