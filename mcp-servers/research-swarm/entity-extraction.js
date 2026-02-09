/**
 * AI-Based Entity Extraction (DeepSeek Only)
 *
 * Sprint 18+ - Simplified to DeepSeek only per user request:
 * - DeepSeek-reasoner for complex entity extraction
 * - DeepSeek-chat for quick defense classification
 *
 * Features:
 * - Entity type classification: person, organization, location
 * - Defense value classification: exculpatory, brady, impeachment, etc.
 * - Confidence scoring based on context quality
 * - Cost tracking per query
 *
 * Integration with Formula Engine:
 * - This module extracts entities from text
 * - Formula Engine scores the document-entity links
 * - Both work together in the discovery pipeline
 */

const OpenAI = require('openai');
const { scoreDocumentActorLink, DEFENSE_CATEGORIES } = require('./formula-engine');

// ============================================
// Configuration
// ============================================

const CONFIG = {
  models: {
    deepseekReasoner: {
      endpoint: 'https://api.deepseek.com/v1',
      model: 'deepseek-reasoner',
      costPerToken: 0.00027 / 1000000, // $0.27 per 1M tokens (input)
      description: 'Complex reasoning for entity extraction',
    },
    deepseekChat: {
      endpoint: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      costPerToken: 0.00014 / 1000000, // $0.14 per 1M tokens
      description: 'Fast classification and simple tasks',
    },
  },

  // Confidence thresholds
  minConfidence: 0.5,
  highConfidenceThreshold: 0.8,

  // Entity types we care about
  validEntityTypes: ['person', 'organization', 'location'],

  // Budget controls
  dailyBudgetUsd: 20.0,
  maxCostPerQuery: 0.01,
};

// ============================================
// DeepSeek Client
// ============================================

class DeepSeekClient {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: CONFIG.models.deepseekReasoner.endpoint,
    });
    this.dailyCosts = new Map();
  }

  /**
   * Extract entities using DeepSeek-reasoner (complex reasoning)
   */
  async extractEntities(text, options = {}) {
    const { useReasoner = true } = options;
    const model = useReasoner ? CONFIG.models.deepseekReasoner : CONFIG.models.deepseekChat;

    try {
      const prompt = this.buildEntityExtractionPrompt(text);
      const response = await this.client.chat.completions.create({
        model: model.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 800,
      });

      const rawContent = response.choices[0].message.content;
      const result = this.parseJsonResponse(rawContent);

      const tokens = response.usage?.total_tokens || 500;
      const cost = this.calculateCost(tokens, useReasoner ? 'deepseekReasoner' : 'deepseekChat');

      this.trackCost(cost);

      return {
        entities: result.entities || [],
        confidence: result.confidence || 0.5,
        reasoning: result.reasoning || 'Extracted via DeepSeek',
        cost,
        tokens,
        model: model.model,
        method: useReasoner ? 'deepseek_reasoner' : 'deepseek_chat',
      };
    } catch (error) {
      console.error('[EntityExtraction] DeepSeek failed:', error.message);
      return {
        entities: [],
        confidence: 0,
        reasoning: `Error: ${error.message}`,
        cost: 0,
        error: error.message,
        model: 'deepseek-error',
        method: 'error',
      };
    }
  }

  /**
   * Classify defense value using DeepSeek-chat (fast)
   */
  async classifyDefenseValue(text, actorName, options = {}) {
    const { countContext, theoryContext } = options;

    try {
      const prompt = this.buildDefenseClassificationPrompt(text, actorName, countContext, theoryContext);
      const response = await this.client.chat.completions.create({
        model: CONFIG.models.deepseekChat.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
      });

      const rawContent = response.choices[0].message.content;
      const result = this.parseJsonResponse(rawContent);

      const tokens = response.usage?.total_tokens || 300;
      const cost = this.calculateCost(tokens, 'deepseekChat');
      this.trackCost(cost);

      return {
        defenseCategory: result.category || 'context',
        importanceScore: result.importance || 50,
        reasoning: result.reasoning || 'Classified via DeepSeek',
        isSubstantive: result.isSubstantive !== false,
        cost,
        tokens,
      };
    } catch (error) {
      console.error('[DefenseClassification] DeepSeek failed:', error.message);
      return {
        defenseCategory: 'context',
        importanceScore: 30,
        reasoning: `Error: ${error.message}`,
        isSubstantive: false,
        cost: 0,
        error: error.message,
      };
    }
  }

  /**
   * Combined extraction + classification in one call (more efficient)
   */
  async extractAndClassify(text, options = {}) {
    const { actorFilter, countContext, theoryContext, caseActors } = options;

    try {
      const prompt = this.buildCombinedPrompt(text, actorFilter, countContext, theoryContext);
      const response = await this.client.chat.completions.create({
        model: CONFIG.models.deepseekReasoner.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1200,
      });

      const rawContent = response.choices[0].message.content;
      const result = this.parseJsonResponse(rawContent);

      const tokens = response.usage?.total_tokens || 800;
      const cost = this.calculateCost(tokens, 'deepseekReasoner');
      this.trackCost(cost);

      // Enhance each entity with formula-based scoring
      const enhancedEntities = (result.entities || []).map(entity => {
        // Apply formula engine scoring for additional signals
        const formulaResult = scoreDocumentActorLink(
          {
            content: text,
            documentId: options.documentId || 'unknown',
            documentName: options.documentName || 'unknown',
            keywords: result.keywords || [],
            tagFeas: result.tagFeas || {},
          },
          {
            actorName: entity.name,
            actorAliases: entity.aliases || [],
            countContext,
            theoryContext,
            caseActors: caseActors || [],
          },
          'formula_d'
        );

        // Blend DeepSeek classification with formula scoring
        const blendedImportance = Math.round(
          (entity.importance || 50) * 0.6 +  // DeepSeek classification (primary)
          formulaResult.importanceScore * 0.4 // Formula signals (secondary)
        );

        return {
          ...entity,
          defenseCategory: entity.category || formulaResult.defenseCategory,
          importanceScore: blendedImportance,
          formulaSignals: formulaResult.signals,
          isSubstantive: entity.isSubstantive !== false && !formulaResult.signals?.signaturePenalty,
        };
      });

      return {
        entities: enhancedEntities,
        confidence: result.confidence || 0.7,
        reasoning: result.reasoning || 'Extracted and classified via DeepSeek',
        keywords: result.keywords || [],
        cost,
        tokens,
        model: CONFIG.models.deepseekReasoner.model,
        method: 'deepseek_combined',
      };
    } catch (error) {
      console.error('[ExtractAndClassify] DeepSeek failed:', error.message);
      return this.fallbackExtraction(text);
    }
  }

  // ============================================
  // Prompt Builders
  // ============================================

  buildEntityExtractionPrompt(text) {
    return `Extract legal entities from this document text. Focus on PEOPLE and ORGANIZATIONS involved in legal proceedings.

CRITICAL RULES:
1. ONLY extract actual people (defendants, witnesses, attorneys) and organizations (companies, firms, agencies)
2. DO NOT extract common nouns like "Payment", "Conference", "Meeting", "Discussion"
3. DO NOT extract document types, dates, or general concepts
4. Each entity must include: name, type (person/organization), confidence (0.0-1.0), context

TEXT TO ANALYZE:
${text.substring(0, 2000)}${text.length > 2000 ? '...' : ''}

Respond with valid JSON only:
{
  "entities": [
    {
      "name": "John Smith",
      "type": "person",
      "confidence": 0.95,
      "context": "defendant mentioned in witness statement"
    }
  ],
  "confidence": 0.85,
  "reasoning": "Brief explanation of extraction logic"
}`;
  }

  buildDefenseClassificationPrompt(text, actorName, countContext, theoryContext) {
    return `Classify the defense value of this document mention for the actor "${actorName}".

DEFENSE CATEGORIES (choose one):
- exculpatory: Supports innocence or undermines prosecution case
- brady: Material that prosecution must disclose (favorable to defense)
- impeachment: Undermines credibility of prosecution witness
- contradiction: Conflicts with government's stated position or timeline
- corroboration: Supports defense theory or alibi
- context: Background information with moderate relevance
- administrative: Signatures, contact info, CC lines, footers (low value)
- dismissed: Not relevant to defense at all

${countContext ? `COUNT CONTEXT: ${countContext}` : ''}
${theoryContext ? `THEORY CONTEXT: ${theoryContext}` : ''}

DOCUMENT TEXT:
${text.substring(0, 1500)}${text.length > 1500 ? '...' : ''}

Respond with valid JSON only:
{
  "category": "impeachment",
  "importance": 75,
  "reasoning": "Brief explanation of why this category",
  "isSubstantive": true
}`;
  }

  buildCombinedPrompt(text, actorFilter, countContext, theoryContext) {
    return `Extract and classify legal entities from this document for defense value analysis.

EXTRACTION RULES:
1. Extract PEOPLE and ORGANIZATIONS involved in legal proceedings
2. Skip common nouns, document types, dates
3. For each entity, classify its defense value

DEFENSE CATEGORIES:
- exculpatory (importance 80-100): Supports innocence
- brady (importance 80-100): Prosecution must disclose
- impeachment (importance 60-80): Undermines prosecution witness
- contradiction (importance 60-80): Conflicts with govt narrative
- corroboration (importance 50-70): Supports defense theory
- context (importance 30-50): Background information
- administrative (importance 0-20): Signatures, CC lines, footers
- dismissed (importance 0): Not relevant

${actorFilter ? `FOCUS ON THESE ACTORS: ${actorFilter}` : ''}
${countContext ? `COUNT CONTEXT: ${countContext}` : ''}
${theoryContext ? `THEORY CONTEXT: ${theoryContext}` : ''}

DOCUMENT TEXT:
${text.substring(0, 2500)}${text.length > 2500 ? '...' : ''}

Respond with valid JSON only:
{
  "entities": [
    {
      "name": "Gary Cox",
      "type": "person",
      "confidence": 0.9,
      "category": "impeachment",
      "importance": 75,
      "context": "testified about billing compliance",
      "isSubstantive": true
    }
  ],
  "keywords": ["billing", "compliance", "medicare"],
  "confidence": 0.85,
  "reasoning": "Explanation of extraction and classification"
}`;
  }

  // ============================================
  // Utilities
  // ============================================

  parseJsonResponse(rawContent) {
    try {
      // Try to extract JSON from response (may have markdown code blocks)
      const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                        rawContent.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, rawContent];
      const jsonStr = jsonMatch[1] || rawContent;

      // Clean up common issues
      const cleaned = jsonStr
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .replace(/,\s*}/g, '}')          // Remove trailing commas
        .replace(/,\s*]/g, ']')
        .trim();

      return JSON.parse(cleaned);
    } catch (error) {
      console.error('[ParseJSON] Failed to parse:', error.message);
      return { entities: [], confidence: 0, error: error.message };
    }
  }

  calculateCost(tokens, modelKey) {
    const costPerToken = CONFIG.models[modelKey]?.costPerToken || 0;
    return tokens * costPerToken;
  }

  trackCost(cost) {
    const today = new Date().toISOString().split('T')[0];
    const current = this.dailyCosts.get(today) || 0;
    this.dailyCosts.set(today, current + cost);
  }

  canAffordQuery() {
    const today = new Date().toISOString().split('T')[0];
    const todayTotal = this.dailyCosts.get(today) || 0;
    return todayTotal < CONFIG.dailyBudgetUsd;
  }

  getDailyCosts() {
    return Object.fromEntries(this.dailyCosts);
  }

  /**
   * Fallback extraction when API fails
   */
  fallbackExtraction(text) {
    console.log('[EntityExtraction] Using fallback regex extraction');

    const namePattern = /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    const matches = text.match(namePattern) || [];

    const commonNouns = [
      'Payment', 'Conference', 'Meeting', 'Discussion', 'Interview',
      'Document', 'Evidence', 'Witness', 'Statement', 'Report',
      'Analysis', 'Review', 'Summary', 'Overview', 'Update',
      'Request', 'Response', 'Notice', 'Letter', 'Email',
    ];

    const filteredEntities = matches
      .filter(name => !commonNouns.some(noun => name.toLowerCase().includes(noun.toLowerCase())))
      .slice(0, 5)
      .map(name => ({
        name: name.trim(),
        type: 'person',
        confidence: 0.3,
        context: 'fallback extraction',
        defenseCategory: 'context',
        importanceScore: 30,
        isSubstantive: false,
      }));

    return {
      entities: filteredEntities,
      confidence: 0.3,
      reasoning: 'Fallback regex extraction (API unavailable)',
      method: 'fallback',
      cost: 0,
      tokens: 0,
    };
  }
}

// ============================================
// Entity Extraction Engine
// ============================================

class EntityExtractionEngine {
  constructor() {
    this.client = new DeepSeekClient();
    this.queryCount = 0;
  }

  /**
   * Main extraction method - extract entities with defense classification
   */
  async extractEntities(text, options = {}) {
    try {
      if (!this.client.canAffordQuery()) {
        console.warn('[EntityExtraction] Daily budget exceeded, using fallback');
        return this.client.fallbackExtraction(text);
      }

      this.queryCount++;

      // Use combined extraction + classification (most efficient)
      const result = await this.client.extractAndClassify(text, options);

      return {
        ...result,
        queryNumber: this.queryCount,
      };
    } catch (error) {
      console.error('[EntityExtraction] Engine failed:', error.message);
      return this.client.fallbackExtraction(text);
    }
  }

  /**
   * Classify a specific actor mention in context
   */
  async classifyActorMention(text, actorName, options = {}) {
    try {
      if (!this.client.canAffordQuery()) {
        return {
          defenseCategory: 'context',
          importanceScore: 30,
          reasoning: 'Budget exceeded - using default classification',
        };
      }

      return await this.client.classifyDefenseValue(text, actorName, options);
    } catch (error) {
      console.error('[ClassifyActorMention] Failed:', error.message);
      return {
        defenseCategory: 'context',
        importanceScore: 30,
        reasoning: `Error: ${error.message}`,
      };
    }
  }

  /**
   * Get cost tracking data
   */
  getCostData() {
    return {
      dailyCosts: this.client.getDailyCosts(),
      queryCount: this.queryCount,
      budgetRemaining: CONFIG.dailyBudgetUsd - (this.client.dailyCosts.get(new Date().toISOString().split('T')[0]) || 0),
    };
  }
}

// ============================================
// Exports
// ============================================

let extractionEngine = null;

function getEntityExtractionEngine() {
  if (!extractionEngine) {
    extractionEngine = new EntityExtractionEngine();
  }
  return extractionEngine;
}

async function extractEntitiesWithAI(text, options = {}) {
  const engine = getEntityExtractionEngine();
  return await engine.extractEntities(text, options);
}

async function classifyActorMentionWithAI(text, actorName, options = {}) {
  const engine = getEntityExtractionEngine();
  return await engine.classifyActorMention(text, actorName, options);
}

module.exports = {
  extractEntitiesWithAI,
  classifyActorMentionWithAI,
  getEntityExtractionEngine,
  EntityExtractionEngine,
  DeepSeekClient,
  CONFIG,
  DEFENSE_CATEGORIES,
};
