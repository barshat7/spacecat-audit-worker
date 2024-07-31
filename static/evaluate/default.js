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
  const { body } = document;

  try {
    if (!body) {
      throw new Error('No body element found');
    }

    const elementsToRemove = body.querySelectorAll('iframe, frame, script, link, meta, style');
    elementsToRemove.forEach((el) => el.remove());

    const rawBody = body.innerHTML.replace(/\n/g, '');;

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
};

evalFn();
