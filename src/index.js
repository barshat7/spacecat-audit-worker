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

import wrap from '@adobe/helix-shared-wrap';
import { helixStatus } from '@adobe/helix-status';
import { sqsEventAdapter, resolveSecretsName } from '@adobe/spacecat-shared-utils';
import { secrets } from '@adobe/helix-shared-secrets';
import { noContent } from '@adobe/spacecat-shared-http-utils';

async function run(message, context) {
  const { log } = context;

  log.info('Content Scraper Triggered');

  // TODO: scrape content

  return noContent();
}

export const main = wrap(run)
  .with(sqsEventAdapter)
  .with(secrets, { name: resolveSecretsName })
  .with(helixStatus);
