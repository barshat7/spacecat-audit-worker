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

const EDS_STRUCTURAL_ELEMENTS = ['header', 'footer', 'main'];
const MAIN_CONTENT_SELECTOR = 'body > main';
const BLOCK_SELECTOR = ':scope > .section > [data-block-status], :scope > .section > div > [data-block-status]';

function getElementPath(element) {
  const path = [];
  let current = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    // Add class if present
    if (current.className) {
      selector += `.${current.className.trim().replace(/\s+/g, '.')}`;
    }
    
    // Add position among siblings
    const siblings = Array.from(current.parentNode.children);
    const index = siblings.indexOf(current);
    selector += `:nth-child(${index + 1})`;
    
    path.unshift(selector);
    current = current.parentNode;
  }
  
  return path.join(' > ');
}

function elementInfo(element) {
  return {
    path: getElementPath(element),
    className: element.getAttribute('class') || '',
    tagName: element.tagName,
    index: Array.from(element.parentNode.children).indexOf(element)
  };
}

function getEDSSections(document) {
  // Get default sections
  const sections = EDS_STRUCTURAL_ELEMENTS
    .map(tag => document.querySelector(tag))
    .filter(el => el)
    .map(el => elementInfo(el));

  // Get sections from main content
  const mainElement = document.querySelector(MAIN_CONTENT_SELECTOR);
  if (mainElement?.children?.length) {
    const mainSections = Array.from(mainElement.children)
      .filter(child => child.classList.contains('section'))
      .map(child => elementInfo(child));
    sections.push(...mainSections);
  }

  return sections;
}

function getEDSBlocks(document) {
  const mainElement = document.querySelector(MAIN_CONTENT_SELECTOR);
  if (!mainElement || !mainElement.children || mainElement.children.length === 0) {
    return [];
  }
  const blocks = Array.from(mainElement.querySelectorAll(BLOCK_SELECTOR))
    .map((block) => elementInfo(block));
  return blocks;
}
