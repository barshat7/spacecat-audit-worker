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

import { promises as fs } from 'fs';

const PROMPT_FILENAME = './static/prompts/sections.prompt';

/**
 * Replaces placeholders in the prompt content with their corresponding values.
 *
 * @param {string} content - The prompt content with placeholders.
 * @param {Object} placeholders - The placeholders and their values.
 * @returns {string} - The content with placeholders replaced.
 */
function replacePlaceholders(content, placeholders) {
  return content.replace(/{{(.*?)}}/g, (match, key) => {
    if (key in placeholders) {
      const value = placeholders[key];
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
    } else {
      return match;
    }
  });
}

/**
 * Reads the content of a prompt file asynchronously and replaces any placeholders
 * with the corresponding values. Logs the error and returns null in case of an error.
 *
 * @param {Object} placeholders - A JSON object containing values to replace in the prompt content.
 * @param {Object} log - The logger
 * @returns {Promise<string|null>} - A promise that resolves to a string with the prompt content,
 * or null if an error occurs.
 */
export async function getPrompt(placeholders, log = console) {
  try {
    const promptContent = await fs.readFile(PROMPT_FILENAME, { encoding: 'utf8' });
    return replacePlaceholders(promptContent, placeholders);
  } catch (error) {
    log.error('Error reading prompt file:', error.message);
    return null;
  }
}
