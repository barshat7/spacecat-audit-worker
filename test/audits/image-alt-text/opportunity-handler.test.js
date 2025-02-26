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

/* eslint-env mocha */
import { expect } from 'chai';
import sinon from 'sinon';
import { Audit, Suggestion as SuggestionModel } from '@adobe/spacecat-shared-data-access';
import convertToOpportunity from '../../../src/image-alt-text/opportunityHandler.js';
import suggestionsEngine from '../../../src/image-alt-text/suggestionsEngine.js';

describe('Image Alt Text Opportunity Handler', () => {
  let logStub;
  let dataAccessStub;
  let auditData;
  let auditUrl;
  let altTextOppty;
  let context;

  beforeEach(() => {
    sinon.restore();
    auditUrl = 'https://example.com';
    altTextOppty = {
      getId: () => 'opportunity-id',
      setAuditId: sinon.stub(),
      save: sinon.stub(),
      getSuggestions: sinon.stub().returns([{
        id: 'suggestion-1',
        getStatus: () => 'NEW',
        status: 'NEW',
        getData: () => ({ recommendations: [{ id: 'suggestion-1' }] }),
        remove: sinon.stub().resolves(),
      }]),
      addSuggestions: sinon
        .stub()
        .returns({ errorItems: [], createdItems: [1] }),
      getType: () => Audit.AUDIT_TYPES.ALT_TEXT,
      getSiteId: () => 'site-id',
    };

    logStub = {
      info: sinon.stub(),
      debug: sinon.stub(),
      error: sinon.stub(),
    };

    dataAccessStub = {
      Opportunity: {
        allBySiteIdAndStatus: sinon.stub().resolves([]),
        create: sinon.stub(),
      },
    };

    context = {
      log: logStub,
      dataAccess: dataAccessStub,
    };

    auditData = {
      siteId: 'site-id',
      id: 'audit-id',
      auditResult: {
        detectedTags: {
          imagesWithoutAltText: [
            { url: '/page1', src: 'image1.jpg' },
            { url: '/page2', src: 'image2.jpg' },
          ],
        },
      },
    };

    sinon.stub(suggestionsEngine, 'getImageSuggestions').resolves({
      'https://example.com/image1.jpg': { image_url: '/page1', suggestion: 'Image 1 description' },
      'https://example.com/page2': { image_url: '/page2', suggestion: 'Image 2 description' },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create new opportunity when none exists', async () => {
    dataAccessStub.Opportunity.create.resolves(altTextOppty);

    await convertToOpportunity(auditUrl, auditData, context);

    expect(dataAccessStub.Opportunity.create).to.have.been.calledWith({
      siteId: 'site-id',
      auditId: 'audit-id',
      runbook:
        'https://adobe.sharepoint.com/:w:/s/aemsites-engineering/EeEUbjd8QcFOqCiwY0w9JL8BLMnpWypZ2iIYLd0lDGtMUw?e=XSmEjh',
      type: Audit.AUDIT_TYPES.ALT_TEXT,
      origin: 'AUTOMATION',
      title:
        'Missing alt text for images decreases accessibility and discoverability of content',
      description:
        'Missing alt text on images leads to poor seo scores, low accessibility scores and search engine failing to surface such images with keyword search',
      guidance: {
        recommendations: [
          {
            insight: 'Alt text for images decreases accessibility and limits discoverability',
            recommendation: 'Add meaningful alt text on images that clearly articulate the subject matter of the image',
            type: null,
            rationale: 'Alt text for images is vital to ensure your content is discoverable and usable for many people as possible',
          },
        ],
      },
      tags: ['seo', 'accessibility'],
      data: {
        projectedTrafficLost: 3871,
        projectedTrafficValue: 7355,
      },
    });
    expect(logStub.debug).to.have.been.calledWith(
      '[alt-text]: Opportunity created',
    );
  });

  it('should update existing opportunity when one exists', async () => {
    dataAccessStub.Opportunity.allBySiteIdAndStatus.resolves([altTextOppty]);

    await convertToOpportunity(auditUrl, auditData, context);

    expect(altTextOppty.setAuditId).to.have.been.calledWith('audit-id');
    expect(altTextOppty.save).to.have.been.called;
    expect(dataAccessStub.Opportunity.create).to.not.have.been.called;
  });

  it('should update existing opportunity with empty suggestion if none are found', async () => {
    dataAccessStub.Opportunity.allBySiteIdAndStatus.resolves([altTextOppty]);
    suggestionsEngine.getImageSuggestions.resolves({});

    await convertToOpportunity(auditUrl, auditData, context);

    expect(altTextOppty.setAuditId).to.have.been.calledWith('audit-id');
    expect(altTextOppty.save).to.have.been.called;
    expect(dataAccessStub.Opportunity.create).to.not.have.been.called;
  });

  it('should handle error when fetching opportunities fails', async () => {
    const error = new Error('Fetch failed');
    dataAccessStub.Opportunity.allBySiteIdAndStatus.rejects(error);

    try {
      await convertToOpportunity(auditUrl, auditData, context);
      expect.fail('Should have thrown an error');
    } catch (e) {
      expect(e.message).to.equal(
        '[alt-text]: Failed to fetch opportunities for siteId site-id: Fetch failed',
      );
      expect(logStub.error).to.have.been.calledWith(
        '[alt-text]: Fetching opportunities for siteId site-id failed with error: Fetch failed',
      );
    }
  });

  it('should handle error when creating opportunity fails', async () => {
    const error = new Error('Creation failed');
    dataAccessStub.Opportunity.create.rejects(error);

    try {
      await convertToOpportunity(auditUrl, auditData, context);
      expect.fail('Should have thrown an error');
    } catch (e) {
      expect(e.message).to.equal(
        '[alt-text]: Failed to create alt-text opportunity for siteId site-id: Creation failed',
      );
      expect(logStub.error).to.have.been.calledWith(
        '[alt-text]: Creating alt-text opportunity for siteId site-id failed with error: Creation failed',
        error,
      );
    }
  });

  it('should handle errors when adding suggestions', async () => {
    dataAccessStub.Opportunity.allBySiteIdAndStatus.resolves([altTextOppty]);

    altTextOppty.getSuggestions.returns([{
      id: 'suggestion-1',
      getStatus: () => 'NEW',
      status: 'NEW',
      getData: () => ({ recommendations: [{ id: 'suggestion-1' }] }),
      remove: sinon.stub().resolves(),
    }]);

    altTextOppty.addSuggestions.returns({
      errorItems: [
        {
          item: { url: '/page1', src: 'image1.jpg' },
          error: 'Invalid suggestion data',
        },
      ],
      createdItems: [1], // At least one successful creation to avoid throwing
    });

    await convertToOpportunity(auditUrl, auditData, context);

    expect(logStub.error).to.have.been.calledWith(
      '[alt-text]: Suggestions for siteId site-id contains 1 items with errors',
    );
    expect(logStub.error).to.have.been.calledWith(
      '[alt-text]: Item {"url":"/page1","src":"image1.jpg"} failed with error: Invalid suggestion data',
    );
  });

  it('should throw error when all suggestions fail to create', async () => {
    dataAccessStub.Opportunity.allBySiteIdAndStatus.resolves([altTextOppty]);

    altTextOppty.getSuggestions.returns([{
      id: 'suggestion-1',
      getStatus: () => 'NEW',
      status: 'NEW',
      getData: () => ({ recommendations: [{ id: 'suggestion-1' }] }),
      remove: sinon.stub().resolves(),
    }]);

    altTextOppty.addSuggestions.returns({
      errorItems: [
        {
          item: { url: '/page1', src: 'image1.jpg' },
          error: 'Invalid suggestion data',
        },
      ],
      createdItems: [], // No successful creations
    });

    try {
      await convertToOpportunity(auditUrl, auditData, context);
      expect.fail('Should have thrown an error');
    } catch (e) {
      expect(e.message).to.equal('[alt-text]: Failed to create suggestions for siteId site-id');
      expect(logStub.error).to.have.been.calledWith(
        '[alt-text]: Suggestions for siteId site-id contains 1 items with errors',
      );
      expect(logStub.error).to.have.been.calledWith(
        '[alt-text]: Item {"url":"/page1","src":"image1.jpg"} failed with error: Invalid suggestion data',
      );
    }
  });

  it('should preserve ignored suggestions when syncing', async () => {
    dataAccessStub.Opportunity.allBySiteIdAndStatus.resolves([altTextOppty]);

    // Mock existing suggestions with one ignored
    const mockSuggestions = [
      {
        id: 'suggestion-1',
        getStatus: () => SuggestionModel.STATUSES.SKIPPED,
        status: SuggestionModel.STATUSES.SKIPPED,
        getData: () => ({ recommendations: [{ id: 'suggestion-1' }] }),
        remove: sinon.stub().resolves(),
      },
      {
        id: 'suggestion-2',
        getStatus: () => 'NEW',
        status: 'NEW',
        getData: () => ({ recommendations: [{ id: 'suggestion-2' }] }),
        remove: sinon.stub().resolves(),
      },
    ];

    altTextOppty.getSuggestions.returns(mockSuggestions);

    await convertToOpportunity(auditUrl, auditData, context);

    // Verify that only non-ignored suggestion was removed
    expect(mockSuggestions[0].remove).to.not.have.been.called;
    expect(mockSuggestions[1].remove).to.have.been.called;
  });
});
