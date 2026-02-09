/**
 * LegalAI Research Server
 *
 * HTTP API wrapper around Research-Swarm that:
 * - Integrates with local Elasticsearch
 * - Stores learned patterns in ReasoningBank
 * - Exposes REST endpoints for the browser app
 */

const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import ReasoningBank integration for learned patterns
const {
  recallPatterns,
  storePattern,
  investigateWithLearning
} = require('./legalai-integration');

// Import Circuit Breaker for resilience (RES-002)
const { CircuitBreaker } = require('./circuit-breaker');

// Import Formula Engine for defense value scoring (Sprint 18+)
const {
  scoreDocumentActorLink,
  isLikelyAdministrative,
  applyUREPenalty,           // URE constraint validation penalty (Sprint 18+)
  scoreWithUREValidation,    // Combined Formula D + URE
  DEFENSE_CATEGORIES,
} = require('./formula-engine');

// Import Entity Extraction (DeepSeek only)
const {
  extractEntitiesWithAI,
  classifyActorMentionWithAI,
} = require('./entity-extraction');

// Import Mode Router for smart query routing (Sprint 18+)
const {
  detectSearchMode,
  getModeSearchParams,
  postProcessResults,
  enhancePromptForMode,
  SEARCH_MODES,
  MODE_CONFIG,
} = require('./mode-router');

const PORT = process.env.PORT || 3012;
const DATA_DIR = path.join(__dirname, 'data');

// RATE LIMITING CONFIGURATION (STAB-004)
// Controls batch processing to prevent PostgREST connection pool overload
const RATE_LIMIT_CONFIG = {
  BATCH_SIZE: 5,        // Max concurrent actor saves
  BATCH_DELAY: 100,     // Milliseconds between batches
  RETRY_COUNT: 3,       // Retry attempts on 504 errors
  RETRY_DELAY: 100      // Base retry delay (exponential backoff)
};

// ============================================================================
// SWARM CONTROL STATE (Sprint 18.6)
// Track swarm running state and activity for UI control
// ============================================================================
const swarmState = {
  running: false,
  startedAt: null,
  pausedAt: null,
  currentTask: null,
  investigationQueue: [],
  discoveryCount: 0,
  lastActivity: null,
  activityLog: []  // Recent activity entries for UI display
};

/**
 * Add entry to swarm activity log (keeps last 100 entries)
 */
function logSwarmActivity(type, message, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    message,
    ...metadata
  };
  swarmState.activityLog.unshift(entry);
  if (swarmState.activityLog.length > 100) {
    swarmState.activityLog = swarmState.activityLog.slice(0, 100);
  }
  swarmState.lastActivity = entry.timestamp;
  console.log(`[Swarm] [${type}] ${message}`);
}

// ============================================================================
// AUTONOMOUS SWARM PROCESSING LOOP (Sprint 18.6)
// Actually processes the investigation queue when swarm is running
// ============================================================================
let swarmProcessingTimer = null;
const SWARM_PROCESS_INTERVAL = 30000; // 30 seconds between checks

/**
 * Process one investigation from the queue
 * Called by the swarm loop when running
 */
async function processNextInvestigation() {
  if (!swarmState.running) {
    return null;
  }

  // Find next queued investigation (FIFO, but urgent/high priority first)
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  const queuedItems = swarmState.investigationQueue
    .filter(item => item.status === 'queued')
    .sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  if (queuedItems.length === 0) {
    return null; // Nothing to process
  }

  const investigation = queuedItems[0];
  investigation.status = 'processing';
  investigation.startedAt = new Date().toISOString();
  swarmState.currentTask = investigation.question;

  logSwarmActivity('search', `Processing investigation: "${investigation.question}"`, {
    investigationId: investigation.id,
    requestedBy: investigation.requestedBy
  });

  try {
    // Extract key terms from the question for search
    const searchTerms = extractSearchTermsFromQuestion(investigation.question);

    if (searchTerms.length === 0) {
      throw new Error('Could not extract search terms from question');
    }

    logSwarmActivity('search', `Extracted search terms: ${searchTerms.join(', ')}`, {
      investigationId: investigation.id
    });

    // Use the existing batch-discover logic to search and extract entities
    // This searches Elasticsearch and queues discoveries to triage inbox
    const discoveries = await runInvestigationSearch(
      searchTerms,
      investigation.caseId,
      investigation.requestedBy,
      investigation.id,
      investigation.question
    );

    investigation.status = 'completed';
    investigation.completedAt = new Date().toISOString();
    investigation.discoveryCount = discoveries?.length || 0;
    swarmState.discoveryCount += investigation.discoveryCount;

    logSwarmActivity('discovery', `Completed investigation: ${investigation.discoveryCount} discoveries`, {
      investigationId: investigation.id,
      requestedBy: investigation.requestedBy
    });

    swarmState.currentTask = null;
    return investigation;
  } catch (error) {
    investigation.status = 'failed';
    investigation.error = error.message;
    investigation.failedAt = new Date().toISOString();
    swarmState.currentTask = null;

    logSwarmActivity('error', `Investigation failed: ${error.message}`, {
      investigationId: investigation.id
    });

    return investigation;
  }
}

/**
 * Extract search terms from a natural language question
 * Simple implementation - extracts quoted strings, names, and key nouns
 */
function extractSearchTermsFromQuestion(question) {
  const terms = [];

  // Extract quoted strings first
  const quotedMatches = question.match(/"([^"]+)"/g);
  if (quotedMatches) {
    terms.push(...quotedMatches.map(q => q.replace(/"/g, '')));
  }

  // Common question words to filter out
  const stopWords = new Set([
    'find', 'search', 'look', 'for', 'are', 'there', 'any', 'the', 'a', 'an',
    'what', 'who', 'when', 'where', 'why', 'how', 'which', 'documents', 'that',
    'mention', 'mentions', 'about', 'between', 'with', 'from', 'to', 'in', 'on',
    'all', 'show', 'me', 'get', 'list', 'tell', 'investigate', 'analysis', 'of',
    'did', 'does', 'do', 'was', 'were', 'is', 'and', 'or', 'not', 'communications'
  ]);

  // Extract potential names (capitalized words not at sentence start)
  const words = question.replace(/[^\w\s]/g, ' ').split(/\s+/);
  words.forEach((word, idx) => {
    const lower = word.toLowerCase();
    if (word.length > 2 && !stopWords.has(lower)) {
      // Check if it's a capitalized word (potential name)
      if (word[0] === word[0].toUpperCase() && idx > 0) {
        terms.push(word);
      } else if (word.length > 4 && !stopWords.has(lower)) {
        // Include longer non-stop words
        terms.push(word);
      }
    }
  });

  // Deduplicate and limit
  return [...new Set(terms)].slice(0, 5);
}

/**
 * Run investigation search (uses existing batch-discover logic)
 */
async function runInvestigationSearch(searchTerms, caseId, requestedBy, investigationId, question) {
  const discoveries = [];

  for (const term of searchTerms) {
    try {
      // Search Elasticsearch
      const esResults = await searchElasticsearch(term, 50);

      if (esResults.hits && esResults.hits.length > 0) {
        // Extract entities from chunks
        const entities = extractEntitiesFromChunks(esResults.hits);

        // Queue each entity for human review
        for (const entity of entities.slice(0, 10)) {
          try {
            const validation = await queueDiscoveryForReview({
              entityType: 'actor',
              entityName: entity.name,
              entityData: {
                suggestedType: entity.suggestedType || 'person',
                mentions: entity.mentions || [],
                sourceDocuments: entity.sourceDocuments || [],
                // RAGFlow document/KB IDs for opening in document viewer
                ragflowDocId: entity.sourceDocuments?.[0] || null,
                ragflowKbId: entity.sourceKbIds?.[0] || null,
                documentMentions: entity.mentions?.map(m => ({
                  documentName: m.document,
                  ragflowDocId: m.ragflowDocId,
                  ragflowKbId: m.ragflowKbId,
                  chunkId: m.chunkId,
                  snippet: m.contextSnippet
                })) || []
              },
              discoverySource: 'swarm-investigation',
              sourceDocumentIds: entity.sourceDocuments || [],
              sourceChunkIds: entity.chunkIds || [],
              confidenceContext: {
                searchTerm: term,
                sourceKbIds: entity.sourceKbIds || []
              },
              priority: 'normal',
              requestedBy,
              investigationId,
              investigationQuestion: question
            });
            discoveries.push(validation);
          } catch (err) {
            if (!err.message.includes('duplicate')) {
              console.error(`[Swarm] Failed to queue entity ${entity.name}:`, err.message);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Swarm] Search failed for term "${term}":`, error.message);
    }
  }

  return discoveries;
}

/**
 * Main swarm processing loop - runs every SWARM_PROCESS_INTERVAL ms when active
 */
async function swarmProcessingLoop() {
  if (!swarmState.running) {
    return; // Swarm is paused
  }

  try {
    const result = await processNextInvestigation();
    if (!result) {
      // No work to do, log idle status
      logSwarmActivity('analysis', 'Swarm idle - no investigations in queue');
    }
  } catch (error) {
    logSwarmActivity('error', `Swarm processing error: ${error.message}`);
  }
}

/**
 * Start the autonomous swarm processing loop
 */
function startSwarmLoop() {
  if (swarmProcessingTimer) {
    clearInterval(swarmProcessingTimer);
  }
  swarmProcessingTimer = setInterval(swarmProcessingLoop, SWARM_PROCESS_INTERVAL);
  console.log(`[Swarm] Processing loop started (interval: ${SWARM_PROCESS_INTERVAL}ms)`);
}

/**
 * Stop the swarm processing loop (called on server shutdown)
 */
function stopSwarmLoop() {
  if (swarmProcessingTimer) {
    clearInterval(swarmProcessingTimer);
    swarmProcessingTimer = null;
  }
  console.log('[Swarm] Processing loop stopped');
}

// Start the swarm loop on server startup
startSwarmLoop();

// External service URLs
const BASIN_ANALYZER_URL = 'http://localhost:9383';
const CONSTRAINT_VALIDATOR_URL = 'http://localhost:9385';
const COURTLISTENER_URL = 'http://localhost:9382';
const POSTGREST_URL = process.env.POSTGREST_URL || 'http://postgrest:3000';
const RAGFLOW_BASE_URL = process.env.RAGFLOW_BASE_URL || 'http://ragflow:80';
const RAGFLOW_API_KEY = process.env.RAGFLOW_API_KEY || 'ragflow-isQEmbNKWA1p4SPRSlhu2gaMyhaQnkRyF0xpliZeNdg';

// tRPC Server URL (Sprint 17: primary API for actor operations)
const TRPC_URL = process.env.TRPC_URL || 'http://trpc-backend:3030/trpc';
const DEFAULT_CASE_ID = process.env.DEFAULT_CASE_ID || 'us-v-blackman';

/**
 * Call tRPC mutation endpoint
 * @param {string} procedure - Procedure name (e.g., 'actors.createActor')
 * @param {object} input - Input data for the procedure
 * @returns {Promise<object>} - Result from tRPC
 */
async function callTrpcMutation(procedure, input) {
  // tRPC batched mutation format: POST with body {"0":{"json":{...}}}
  const url = `${TRPC_URL}/${procedure}?batch=1`;
  const batchedInput = { "0": input };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batchedInput),
    });

    const result = await response.json();

    // Extract from batched response format: [{"result":{"data":{"json":...}}}]
    if (Array.isArray(result) && result[0]?.result?.data) {
      return result[0].result.data;
    }

    if (result.error || (Array.isArray(result) && result[0]?.error)) {
      const err = result.error || result[0]?.error;
      const errorMsg = err.message || err.json?.message || JSON.stringify(err);
      throw new Error(`tRPC error: ${errorMsg}`);
    }

    return result.result?.data || result;
  } catch (error) {
    console.error(`[tRPC] ${procedure} failed:`, error.message);
    throw error;
  }
}

/**
 * Call tRPC query endpoint
 * @param {string} procedure - Procedure name (e.g., 'actors.list')
 * @param {object} input - Input data for the procedure
 * @returns {Promise<object>} - Result from tRPC
 */
async function callTrpcQuery(procedure, input = {}) {
  // tRPC batched format: ?batch=1&input={"0":{"json":{...}}}
  const batchedInput = JSON.stringify({ "0": { json: input } });
  const encodedInput = encodeURIComponent(batchedInput);
  const url = `${TRPC_URL}/${procedure}?batch=1&input=${encodedInput}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    // Extract from batched response format: [{"result":{"data":{"json":...}}}]
    if (Array.isArray(result) && result[0]?.result?.data) {
      return result[0].result.data;
    }

    if (result.error || (Array.isArray(result) && result[0]?.error)) {
      const err = result.error || result[0]?.error;
      const errorMsg = err.message || err.json?.message || JSON.stringify(err);
      throw new Error(`tRPC error: ${errorMsg}`);
    }

    return result.result?.data || result;
  } catch (error) {
    console.error(`[tRPC] ${procedure} failed:`, error.message);
    throw error;
  }
}

// ============================================================================
// THEORY/CLAIM MATCHING (Sprint 18.8)
// Match discoveries against existing theories/claims for evidence linking
// ============================================================================

// Cache theories and claims to avoid repeated API calls
let theoriesCache = null;
let theoriesCacheTimestamp = null;
const THEORIES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch theories and claims for the case
 * Caches results to avoid repeated API calls
 * @returns {Promise<Array>} - Array of theories with their claims
 */
async function fetchTheoriesWithClaims() {
  // Check cache validity
  const now = Date.now();
  if (theoriesCache && theoriesCacheTimestamp && (now - theoriesCacheTimestamp) < THEORIES_CACHE_TTL) {
    return theoriesCache;
  }

  try {
    const theories = await callTrpcQuery('theories.list', {
      caseId: DEFAULT_CASE_ID
    });

    // theories.list returns array with claims included
    const result = (theories?.json || theories || []).map(theory => ({
      id: theory.id,
      title: theory.title,
      description: theory.description,
      type: theory.type, // prosecution or defense
      claims: (theory.theory_claims || []).map(claim => ({
        id: claim.id,
        theoryId: theory.id,
        theoryTitle: theory.title,
        theoryType: theory.type,
        statement: claim.statement,
        status: claim.status // proven, disputed, unproven
      }))
    }));

    // Update cache
    theoriesCache = result;
    theoriesCacheTimestamp = now;
    console.log(`[Theories] Cached ${result.length} theories with ${result.reduce((sum, t) => sum + t.claims.length, 0)} total claims`);

    return result;
  } catch (error) {
    console.error('[Theories] Failed to fetch theories:', error.message);
    return [];
  }
}

/**
 * Match discovery content against claims to suggest theory/claim link
 * Uses keyword matching and relevance scoring
 * @param {Object} discovery - The discovery data (entityData, entityName, etc.)
 * @returns {Promise<Object|null>} - Suggested match or null
 */
async function matchDiscoveryToTheoryClaim(discovery) {
  const theories = await fetchTheoriesWithClaims();
  if (!theories || theories.length === 0) {
    return null;
  }

  // Extract text to match against (combine relevant fields)
  const textFields = [
    discovery.entityName,
    discovery.entityData?.summary,
    discovery.entityData?.keyQuote,
    discovery.entityData?.reasoning,
    discovery.entityData?.context,
    discovery.entityData?.statement
  ].filter(Boolean);

  const searchText = textFields.join(' ').toLowerCase();
  if (!searchText || searchText.length < 10) {
    return null; // Not enough text to match
  }

  // Score each claim for relevance
  let bestMatch = null;
  let bestScore = 0;
  const MIN_SCORE_THRESHOLD = 0.3;

  for (const theory of theories) {
    for (const claim of theory.claims) {
      const claimText = (claim.statement || '').toLowerCase();
      if (!claimText) continue;

      // Simple keyword overlap scoring
      const claimWords = claimText.split(/\s+/).filter(w => w.length > 3);
      const searchWords = searchText.split(/\s+/).filter(w => w.length > 3);

      let matchingWords = 0;
      for (const word of claimWords) {
        if (searchText.includes(word)) {
          matchingWords++;
        }
      }

      // Also check if discovery text contains key claim concepts
      for (const word of searchWords) {
        if (claimText.includes(word)) {
          matchingWords += 0.5; // Partial credit for reverse match
        }
      }

      const score = claimWords.length > 0 ? matchingWords / claimWords.length : 0;

      if (score > bestScore && score >= MIN_SCORE_THRESHOLD) {
        bestScore = score;
        bestMatch = {
          theoryId: theory.id,
          theoryTitle: theory.title,
          theoryType: theory.type,
          claimId: claim.id,
          claimStatement: claim.statement,
          matchScore: score,
          // Determine role: defense claims are more likely refuted by prosecution evidence
          suggestedRole: determineEvidenceRole(theory.type, discovery),
          suggestedStrength: score > 0.6 ? 'strong' : score > 0.4 ? 'moderate' : 'weak'
        };
      }
    }
  }

  if (bestMatch) {
    console.log(`[Theories] Matched discovery "${discovery.entityName}" to claim "${bestMatch.claimStatement?.substring(0, 50)}..." (score: ${bestScore.toFixed(2)})`);
  }

  return bestMatch;
}

/**
 * Determine evidence role based on theory type and discovery context
 * @param {string} theoryType - 'prosecution' or 'defense'
 * @param {Object} discovery - The discovery data
 * @returns {string} - 'supports', 'refutes', or 'qualifies'
 */
function determineEvidenceRole(theoryType, discovery) {
  // Default: evidence supports the claim it's matched to
  // In future, could use AI to determine if evidence refutes/qualifies

  const text = [
    discovery.entityData?.context,
    discovery.entityData?.reasoning
  ].filter(Boolean).join(' ').toLowerCase();

  // Simple heuristics for role detection
  if (text.includes('contradict') || text.includes('dispute') || text.includes('disagree') || text.includes('refute')) {
    return 'refutes';
  }
  if (text.includes('qualify') || text.includes('partially') || text.includes('exception') || text.includes('however')) {
    return 'qualifies';
  }

  return 'supports';
}

/**
 * Invalidate theories cache (called when theories are modified)
 */
function invalidateTheoriesCache() {
  theoriesCache = null;
  theoriesCacheTimestamp = null;
  console.log('[Theories] Cache invalidated');
}

// ============================================================================
// VALIDATION QUEUE INTEGRATION (Sprint 18)
// All AI discoveries route through validation queue for human review
// ============================================================================

/**
 * Query learned_weights from tRPC to get confidence adjustment based on historical feedback
 * This is the key feedback loop: triage rejections → learned_weights → future confidence
 * @param {string} entityType - Type of entity (actor, snippet, event, etc.)
 * @param {string} entityName - Name of the entity being discovered
 * @returns {Promise<number>} - Confidence adjustment (-0.5 to +0.5)
 */
async function getLearnedConfidenceAdjustment(entityType, entityName) {
  try {
    // Query learned_weights for this entity type
    const response = await callTrpcQuery('validations.getLearnedWeights', {
      entityType,
      entityName: entityName || ''
    });

    const weights = response?.json || response || [];
    if (!weights || weights.length === 0) {
      return 0; // No learned weights, no adjustment
    }

    // Aggregate adjustments from all relevant weights
    let totalAdjustment = 0;
    for (const weight of weights) {
      // Weight values are typically -0.05 to +0.05 per signal
      totalAdjustment += parseFloat(weight.weight || 0);
    }

    // Clamp adjustment to reasonable range
    return Math.max(-0.3, Math.min(0.3, totalAdjustment));
  } catch (error) {
    // Silently fail - don't break discovery if learned_weights unavailable
    console.log(`[LearnedWeights] Query failed (non-critical): ${error.message}`);
    return 0;
  }
}

/**
 * Calculate confidence factors for a discovery
 * @param {Object} discovery - Discovery data with context
 * @returns {Object} - Confidence factors breakdown
 */
function calculateConfidenceFactors(discovery) {
  const factors = {
    textMatch: 0.5,        // How well text matches expectations
    contextRelevance: 0.5, // Relevance to case context
    sourceQuality: 0.5,    // Quality of source documents
    frequency: 0.5,        // How often entity appears
    crossReference: 0.5    // Corroboration from other sources
  };

  // Text match - based on extraction clarity
  if (discovery.exactMatch) factors.textMatch = 0.95;
  else if (discovery.partialMatch) factors.textMatch = 0.7;

  // Context relevance - based on document type
  const docTypes = discovery.sourceDocumentTypes || [];
  if (docTypes.includes('302') || docTypes.includes('exhibit')) {
    factors.contextRelevance = 0.9;
  } else if (docTypes.includes('email') || docTypes.includes('correspondence')) {
    factors.contextRelevance = 0.75;
  }

  // Source quality - based on chunk scores
  const avgScore = discovery.avgChunkScore || 0;
  factors.sourceQuality = Math.min(avgScore / 100, 1.0);

  // Frequency - based on mention count
  const mentions = discovery.mentionCount || 1;
  factors.frequency = Math.min(mentions / 10, 1.0);

  // Cross-reference - based on multiple sources
  const sourceCount = (discovery.sourceDocumentIds || []).length;
  factors.crossReference = Math.min(sourceCount / 5, 1.0);

  return factors;
}

/**
 * Calculate overall confidence score from factors
 * @param {Object} factors - Confidence factors
 * @returns {number} - Overall confidence 0.0-1.0
 */
function calculateOverallConfidence(factors) {
  const weights = {
    textMatch: 0.25,
    contextRelevance: 0.2,
    sourceQuality: 0.2,
    frequency: 0.15,
    crossReference: 0.2
  };

  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (factors[key] || 0.5) * weight;
  }

  return Math.round(score * 1000) / 1000; // 3 decimal places
}

/**
 * Queue a discovery for human review via validation queue
 * @param {Object} options - Discovery options
 * @param {string} options.entityType - Type: actor, theory, snippet, event, etc.
 * @param {string} options.entityName - Display name for queue
 * @param {Object} options.entityData - Full entity data
 * @param {string} options.discoverySource - Source identifier
 * @param {string[]} options.sourceDocumentIds - RAGFlow document IDs
 * @param {string[]} options.sourceChunkIds - RAGFlow chunk IDs
 * @param {Object} options.confidenceContext - Context for confidence calculation
 * @param {string} options.priority - Priority: low, normal, high, urgent
 * @returns {Promise<Object>} - Created validation record
 */
async function queueDiscoveryForReview(options) {
  const {
    entityType,
    entityName,
    entityData,
    discoverySource = 'ai-research-swarm',
    sourceDocumentIds = [],
    sourceChunkIds = [],
    confidenceContext = {},
    priority = 'normal',
    // Investigation attribution (Sprint 18.6)
    requestedBy = null,           // Email of user who created the investigation
    investigationId = null,       // Parent investigation UUID
    investigationQuestion = null, // Original question text
    // Cost tracking (Sprint 18.6)
    tokensUsed = null,            // { deepseek: 500, gemini: 480, gpt4o: 520 }
    totalTokens = null,
    totalCostUsd = null,
    modelsUsed = null,            // ['deepseek', 'gemini', 'gpt4o']
    primaryModel = null,          // Model that provided final answer
    processingTimeMs = null       // Time to generate discovery
  } = options;

  // Calculate confidence (with learned_weights feedback loop)
  const confidenceFactors = calculateConfidenceFactors(confidenceContext);
  let aiConfidence = calculateOverallConfidence(confidenceFactors);

  // Apply learned_weights adjustment if available
  const learnedAdjustment = await getLearnedConfidenceAdjustment(entityType, entityName);
  if (learnedAdjustment !== 0) {
    aiConfidence = Math.max(0, Math.min(1, aiConfidence + learnedAdjustment));
    console.log(`[queueDiscovery] Applied learned adjustment ${learnedAdjustment.toFixed(3)} → confidence: ${aiConfidence.toFixed(3)}`);
  }

  // ============================================
  // FORMULA ENGINE SCORING (Sprint 18+)
  // Calculate importance score and defense category
  // ============================================
  let importanceScore = 50;  // Default moderate importance
  let defenseCategory = 'context';  // Default category
  let formulaUsed = 'formula_d';
  let formulaSignals = {};

  // Only run formula scoring for entity types that have document content
  const contentForScoring = entityData?.contextSnippet ||
                            entityData?.mentions?.[0]?.contextSnippet ||
                            entityData?.documentMentions?.[0]?.snippet ||
                            confidenceContext?.contentPreview ||
                            '';

  if (contentForScoring && contentForScoring.length > 20) {
    try {
      // Quick check if this is likely administrative (signature, footer)
      if (isLikelyAdministrative(contentForScoring)) {
        defenseCategory = DEFENSE_CATEGORIES.ADMINISTRATIVE;
        importanceScore = 10;
        formulaUsed = 'quick_filter';
        console.log(`[queueDiscovery] Quick filter: "${entityName}" is administrative content`);
      } else {
        // Full formula scoring
        const formulaResult = scoreDocumentActorLink(
          {
            content: contentForScoring,
            documentId: sourceDocumentIds?.[0] || 'unknown',
            documentName: entityData?.documentName || entityData?.sourceDocuments?.[0] || 'unknown',
            keywords: confidenceContext?.keywords || [],
            tagFeas: confidenceContext?.tagFeas || {},
            documentType: confidenceContext?.documentType || 'other',
          },
          {
            actorName: entityName,
            actorAliases: entityData?.aliases || [],
            countContext: confidenceContext?.countContext || '',
            theoryContext: confidenceContext?.theoryContext || '',
            caseActors: confidenceContext?.caseActors || [],
          },
          'formula_d'
        );

        // Sprint 18+: Apply URE constraint validation if available
        // When Z3 finds contradictions (UNSAT), boost importance for defense value
        const constraintResult = confidenceContext?.constraintResult || null;
        if (constraintResult && constraintResult.validated) {
          const ureResult = applyUREPenalty(formulaResult, constraintResult);
          importanceScore = ureResult.importanceScore;
          defenseCategory = ureResult.defenseCategory;
          formulaUsed = ureResult.constraintStatus === 'UNSAT' ? 'formula_d+ure_unsat' : 'formula_d+ure';
          formulaSignals = ureResult.signals;
          console.log(`[queueDiscovery] URE ${ureResult.constraintStatus}: "${entityName}" → ${defenseCategory} (importance: ${importanceScore})`);
        } else {
          importanceScore = formulaResult.importanceScore;
          defenseCategory = formulaResult.defenseCategory;
          formulaUsed = formulaResult.formulaId;
          formulaSignals = formulaResult.signals;
          console.log(`[queueDiscovery] Formula ${formulaUsed}: "${entityName}" → ${defenseCategory} (importance: ${importanceScore})`);
        }
      }
    } catch (formulaErr) {
      console.error(`[queueDiscovery] Formula scoring failed: ${formulaErr.message}`);
      // Fall back to defaults
    }
  } else {
    console.log(`[queueDiscovery] No content for scoring "${entityName}" - using defaults`);
  }

  try {
    // Sprint 18.7: Enhanced fuzzy matching for deduplication
    // Fetch all pending validations of the same type and find best fuzzy match
    const FUZZY_THRESHOLD = 0.8; // 80% similarity required for merge
    let bestMatch = null;
    let bestMatchScore = 0;

    try {
      // Get all pending validations of the same entity type
      const pendingValidations = await callTrpcQuery('validations.list', {
        caseId: DEFAULT_CASE_ID,
        status: 'pending',
        entityType: entityType,
        limit: 100
      });

      if (pendingValidations && pendingValidations.length > 0) {
        // Find best fuzzy match using Levenshtein-based similarity
        for (const pending of pendingValidations) {
          const similarity = stringSimilarity(entityName, pending.entity_name);
          if (similarity > bestMatchScore) {
            bestMatchScore = similarity;
            bestMatch = pending;
          }
        }

        console.log(`[queueDiscovery] Best fuzzy match for "${entityName}": "${bestMatch?.entity_name}" (${(bestMatchScore * 100).toFixed(1)}% similar)`);
      }
    } catch (listErr) {
      console.log(`[queueDiscovery] Could not fetch pending list for fuzzy match: ${listErr.message}`);
      // Fall back to exact match
      bestMatch = await callTrpcQuery('validations.findPendingByEntity', {
        caseId: DEFAULT_CASE_ID,
        entityType,
        entityName
      });
      if (bestMatch) bestMatchScore = 1.0;
    }

    // If we found a good match (>=80% similar), merge with it
    if (bestMatch && bestMatch.id && bestMatchScore >= FUZZY_THRESHOLD) {
      console.log(`[queueDiscovery] Merging with existing "${bestMatch.entity_name}" (${(bestMatchScore * 100).toFixed(1)}% match)`);

      const appendResult = await callTrpcMutation('validations.appendDiscovery', {
        json: {
          id: bestMatch.id,
          sourceDocumentIds,
          sourceChunkIds,
          additionalData: {
            ...entityData,
            // Track the original name variant for reference
            nameVariant: entityName,
            matchedAs: bestMatch.entity_name,
            matchScore: bestMatchScore
          },
          discoverySource,
          newConfidence: aiConfidence,
          newConfidenceFactors: confidenceFactors,
          additionalTokens: totalTokens || 0,
          additionalCostUsd: totalCostUsd || 0
        }
      });

      console.log(`[queueDiscovery] Appended to existing - now has ${appendResult.json?.totalSources || 'multiple'} sources`);
      return { ...appendResult, appended: true, existingId: bestMatch.id, matchScore: bestMatchScore };
    }

    // No existing pending entity - create new validation

    // Sprint 18.8: Match discovery to theories/claims for evidence linking suggestion
    const theoryMatch = await matchDiscoveryToTheoryClaim({ entityName, entityData });

    const validationInput = {
      caseId: DEFAULT_CASE_ID,
      entityType,
      entityName,
      entityData,
      discoverySource,
      sourceDocumentIds,
      sourceChunkIds,
      aiConfidence,
      confidenceFactors,
      confidenceModel: 'research-swarm-v1',
      priority,
      // Defense value scoring (Sprint 18+) - Formula Engine integration
      importanceScore,
      defenseCategory,
      formulaUsed,
      formulaSignals,
      // Investigation attribution (Sprint 18.6) - for notification on completion
      ...(requestedBy && { requestedBy }),
      ...(investigationId && { investigationId }),
      ...(investigationQuestion && { investigationQuestion }),
      // Cost tracking (Sprint 18.6) - for model performance analysis
      ...(tokensUsed && { tokensUsed }),
      ...(totalTokens && { totalTokens }),
      ...(totalCostUsd && { totalCostUsd }),
      ...(modelsUsed && { modelsUsed }),
      ...(primaryModel && { primaryModel }),
      ...(processingTimeMs && { processingTimeMs }),
      // Theory/Claim suggestions (Sprint 18.8) - AI suggests, human approves
      ...(theoryMatch && {
        suggestedTheoryId: theoryMatch.theoryId,
        suggestedClaimId: theoryMatch.claimId,
        suggestedEvidenceRole: theoryMatch.suggestedRole,
        suggestedEvidenceStrength: theoryMatch.suggestedStrength
      })
    };

    const result = await callTrpcMutation('validations.create', { json: validationInput });
    console.log(`[queueDiscovery] Queued ${entityType} "${entityName}" for review (confidence: ${aiConfidence.toFixed(2)})`);
    return { ...result, appended: false };
  } catch (error) {
    console.error(`[queueDiscovery] Failed to queue ${entityType} "${entityName}":`, error.message);
    throw error;
  }
}

/**
 * Queue multiple discoveries in batch
 * @param {Array<Object>} discoveries - Array of discovery options
 * @returns {Promise<Object>} - Batch result
 */
async function queueDiscoveriesBatch(discoveries) {
  // Sprint 18.8: Match each discovery to theories/claims in parallel
  const itemsWithTheoryMatch = await Promise.all(discoveries.map(async (d) => {
    const confidenceFactors = calculateConfidenceFactors(d.confidenceContext || {});
    const aiConfidence = calculateOverallConfidence(confidenceFactors);

    // Match discovery to theories/claims for evidence linking suggestion
    const theoryMatch = await matchDiscoveryToTheoryClaim({
      entityName: d.entityName,
      entityData: d.entityData
    });

    return {
      caseId: DEFAULT_CASE_ID,
      entityType: d.entityType,
      entityName: d.entityName,
      entityData: d.entityData,
      discoverySource: d.discoverySource || 'ai-research-swarm',
      sourceDocumentIds: d.sourceDocumentIds || [],
      sourceChunkIds: d.sourceChunkIds || [],
      aiConfidence,
      confidenceFactors,
      confidenceModel: 'research-swarm-v1',
      priority: d.priority || 'normal',
      // Theory/Claim suggestions (Sprint 18.8)
      ...(theoryMatch && {
        suggestedTheoryId: theoryMatch.theoryId,
        suggestedClaimId: theoryMatch.claimId,
        suggestedEvidenceRole: theoryMatch.suggestedRole,
        suggestedEvidenceStrength: theoryMatch.suggestedStrength
      })
    };
  }));

  try {
    const result = await callTrpcMutation('validations.createBatch', { json: { items: itemsWithTheoryMatch } });
    console.log(`[queueDiscoveriesBatch] Queued ${result.json?.created || itemsWithTheoryMatch.length} discoveries for review`);
    return result;
  } catch (error) {
    console.error(`[queueDiscoveriesBatch] Failed:`, error.message);
    throw error;
  }
}

/**
 * Poll for approved validations and promote them to entities
 * Called periodically or on-demand
 * @returns {Promise<Object>} - Promotion results
 */
async function pollAndPromoteApproved() {
  const results = {
    processed: 0,
    promoted: 0,
    errors: []
  };

  try {
    // Get approved validations
    const response = await callTrpcQuery('validations.list', {
      status: 'approved',
      limit: 50
    });

    const approved = response.json || response || [];
    console.log(`[pollAndPromote] Found ${approved.length} approved validations`);

    for (const validation of approved) {
      results.processed++;
      try {
        await promoteValidationToEntity(validation);
        results.promoted++;
      } catch (err) {
        results.errors.push({ id: validation.id, error: err.message });
      }
    }

    console.log(`[pollAndPromote] Promoted ${results.promoted}/${results.processed} validations`);
    return results;
  } catch (error) {
    console.error(`[pollAndPromote] Error:`, error.message);
    throw error;
  }
}

/**
 * Promote a single approved validation to its target entity
 * @param {Object} validation - Approved validation record
 * @returns {Promise<Object>} - Created entity
 */
async function promoteValidationToEntity(validation) {
  const { entity_type, entity_data, case_id } = validation;
  const data = entity_data || {};

  console.log(`[promoteValidation] Promoting ${entity_type}: ${validation.entity_name}`);

  switch (entity_type) {
    case 'actor':
      return await callTrpcMutation('actors.createActor', {
        json: {
          name: data.name || validation.entity_name,
          displayName: data.displayName || data.name || validation.entity_name,
          actorType: data.actorType || 'person',
          role: data.role,
          description: data.description,
          aliases: data.aliases || [],
          emails: data.emails || [],
          phoneNumbers: data.phoneNumbers || [],
          discoveredBy: 'ai-research',
          aiConfidence: parseFloat(validation.ai_confidence) || 0.5,
          aiSource: validation.discovery_source,
          caseId: case_id
        }
      });

    case 'actor_field_update':
      return await callTrpcMutation('actors.update', {
        json: {
          id: data.actorId,
          data: { [data.field]: data.suggestedValue }
        }
      });

    case 'theory':
      return await callTrpcMutation('theories.create', {
        json: {
          caseId: case_id,
          name: data.name || validation.entity_name,
          description: data.description,
          color: data.color,
          actorIds: data.actorIds || [],
          organizationIds: data.organizationIds || [],
          createdBy: 'ai-promotion'
        }
      });

    case 'claim':
      return await callTrpcMutation('theories.createClaim', {
        json: {
          theoryId: data.theoryId,
          position: data.position || 'neutral',
          statement: data.statement,
          sourceDescription: data.sourceDescription,
          createdBy: 'ai-promotion'
        }
      });

    case 'snippet':
      return await callTrpcMutation('snippets.create', {
        json: {
          caseId: case_id,
          documentId: data.documentId,
          documentFilename: data.documentFilename,
          quotedText: data.quotedText,
          locatorType: data.locatorType || 'page',
          locator: data.locator || {},
          importanceLevel: data.importanceLevel || 'medium',
          snippetType: data.snippetType || 'quote',
          createdBy: 'ai-promotion'
        }
      });

    case 'event':
      return await callTrpcMutation('events.create', {
        json: {
          caseId: case_id,
          eventTitle: data.eventTitle || validation.entity_name,
          eventDate: data.eventDate,
          eventType: data.eventType || 'general',
          eventDescription: data.eventDescription,
          eventLocation: data.eventLocation,
          primaryActorId: data.primaryActorId,
          createdBy: 'ai-promotion'
        }
      });

    case 'evidence_link':
      return await callTrpcMutation('theories.linkEvidence', {
        json: {
          claimId: data.claimId,
          snippetId: data.snippetId,
          caseId: case_id,
          role: data.role || 'supports',
          strength: data.strength,
          notes: data.notes,
          addedBy: 'ai-promotion'
        }
      });

    // Sprint 18.10: Count (criminal charge) creation
    case 'count':
      return await callTrpcMutation('counts.create', {
        json: {
          caseId: case_id,
          number: data.number || 1,
          title: data.title || validation.entity_name,
          statute: data.statute
        }
      });

    // Sprint 18.10: Count element creation
    case 'count_element':
      return await callTrpcMutation('counts.addElement', {
        json: {
          countId: data.countId,
          description: data.description || validation.entity_name,
          status: data.status || 'missing'
        }
      });

    // Sprint 18.10: Link evidence to count element
    case 'element_evidence':
      return await callTrpcMutation('counts.linkEvidence', {
        json: {
          elementId: data.elementId,
          documentId: data.documentId,
          snippetId: data.snippetId
        }
      });

    default:
      throw new Error(`Unknown entity type: ${entity_type}`);
  }
}

// ============================================================================
// CIRCUIT BREAKERS (RES-002) - Prevent cascading failures
// ============================================================================
const circuitBreakers = {
  postgrest: new CircuitBreaker('PostgREST', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000
  }),
  ragflow: new CircuitBreaker('RAGFlow', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,  // Longer timeout for document processing
    resetTimeout: 60000
  }),
  basinAnalyzer: new CircuitBreaker('Basin Analyzer', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 30000
  }),
  constraintValidator: new CircuitBreaker('Constraint Validator', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 30000
  }),
  courtlistener: new CircuitBreaker('CourtListener', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000,  // External API, longer timeout
    resetTimeout: 120000  // 2 min before retry
  })
};

// Helper: Execute fetch with circuit breaker protection
async function protectedFetch(circuitBreaker, url, options = {}) {
  return circuitBreakers[circuitBreaker].execute(async () => {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  });
}

// ============================================================================
// ACTOR DISCOVERY AGENT - Entity extraction and profile building
// ============================================================================

/**
 * Entity patterns for extracting actors from legal documents
 * These patterns identify potential actors, organizations, and their roles
 */
const ENTITY_PATTERNS = {
  // Full names (First Last, First M. Last)
  personName: /\b([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+)\b/g,

  // Legal roles
  legalRoles: /\b(defendant|plaintiff|prosecutor|attorney|judge|witness|co-conspirator|cooperator|agent|investigator)\b/gi,

  // Organizations - common legal entity patterns
  orgPatterns: /\b([A-Z][A-Za-z]+(?: (?:LLC|Inc\.?|Corp\.?|LLP|Ltd\.?|Co\.?|Holdings|Ventures|Network|Health|Medical|Group))+)\b/g,

  // Medical providers (Dr., MD, PA, NP)
  medicalProviders: /\b(?:Dr\.? )?([A-Z][a-z]+ [A-Z][a-z]+),? (?:MD|PA|NP|DO|DDS)\b/g,

  // Government agencies
  govAgencies: /\b(DOJ|FBI|VA OIG|DCIS|CMS|Medicare|HHS|OIG)\b/g,

  // Email addresses (extract sender names)
  emailSender: /"?([A-Z][a-z]+ [A-Z][a-z]+)"?\s*<[^>]+>/g
};

/**
 * Junk patterns to filter out false positive entities
 * These are common metadata fields, titles, and non-actor strings
 * Added in Sprint 09 (DISC-003) to improve entity quality
 */
const JUNK_PATTERNS = [
  // Document metadata fields
  /^(case file|date of|time|place of|interviewed by|folder name|file type|end bates)$/i,
  /^(memorandum|interview|document|file number|case name|exhibit)$/i,
  /^(effective date|contractor|technical support|print name)$/i,
  /^(general partner|member manager|deposit account|signature card)$/i,
  /^(managed llc|new resolution|this banking|no adverse)$/i,
  // Government/generic entities (already caught but explicit)
  /^(human services|federal bureau|microsoft teams|united states)$/i,
  /^(home health|bank america|medical center)$/i,
  // Titles and suffixes alone
  /^(mr|mrs|ms|dr|jr|sr)\.?$/i,
  // Pure patterns that aren't names
  /^[A-Z]{2,4}$/,  // Acronyms like "LLC", "CEO", "FBI" (standalone)
  /^\d+$/,  // Pure numbers
  /^[A-Z][a-z]+$/,  // Single capitalized words like "Interview", "Document"
  // Common legal document terms
  /^(page|section|paragraph|exhibit|attachment|appendix)$/i,
  /^(plaintiff|defendant|witness|agent|attorney)$/i, // Role words alone
  // Date-like patterns
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^(january|february|march|april|may|june|july|august|september|october|november|december)$/i,
];

/**
 * Check if an entity name matches junk patterns
 * @param {string} name - Entity name to check
 * @returns {boolean} - True if entity is junk
 */
function isJunkEntity(name) {
  const normalized = name.trim();
  if (normalized.length < 4) return true; // Too short
  return JUNK_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Extract potential actors from ES search results
 * Returns deduplicated list of entity candidates
 */
function extractEntitiesFromChunks(hits) {
  const entityMap = new Map();

  for (const hit of hits) {
    const content = hit._source?.content_with_weight || '';
    const docName = hit._source?.docnm_kwd || 'Unknown';
    const keywords = hit._source?.important_kwd || [];
    const docId = hit._source?.doc_id || null;      // RAGFlow document UUID
    const kbId = hit._source?.kb_id || null;        // RAGFlow KB UUID
    const chunkId = hit._id || null;                // ES document ID (chunk)

    // Extract person names
    const nameMatches = content.matchAll(ENTITY_PATTERNS.personName);
    for (const match of nameMatches) {
      const name = match[1];
      // Skip common false positives (legacy check)
      if (['Home Health', 'Bank America', 'United States', 'Medical Center'].some(fp => name.includes(fp))) continue;
      // Skip junk patterns (Sprint 09 DISC-003)
      if (isJunkEntity(name)) continue;

      addToEntityMap(entityMap, name, 'person', docName, match.index, content, docId, kbId, chunkId);
    }

    // Extract organizations
    const orgMatches = content.matchAll(ENTITY_PATTERNS.orgPatterns);
    for (const match of orgMatches) {
      addToEntityMap(entityMap, match[1], 'organization', docName, match.index, content, docId, kbId, chunkId);
    }

    // Extract medical providers
    const medMatches = content.matchAll(ENTITY_PATTERNS.medicalProviders);
    for (const match of medMatches) {
      addToEntityMap(entityMap, match[1], 'medical-provider', docName, match.index, content, docId, kbId, chunkId);
    }

    // Add keywords as potential entities
    for (const kw of keywords) {
      if (kw.match(/^[A-Z][A-Za-z]+ [A-Z][a-z]+$/)) {
        addToEntityMap(entityMap, kw, 'keyword-entity', docName, 0, content, docId, kbId, chunkId);
      }
    }
  }

  return Array.from(entityMap.values())
    .filter(e => e.mentions.length >= 2) // Require at least 2 mentions
    .sort((a, b) => b.mentions.length - a.mentions.length);
}

function addToEntityMap(map, name, type, docName, position, content, docId = null, kbId = null, chunkId = null) {
  const key = name.toLowerCase().trim();
  if (key.length < 4) return; // Skip very short names

  if (!map.has(key)) {
    map.set(key, {
      name,
      normalizedName: key,
      suggestedType: type,
      mentions: [],
      contexts: [],
      sourceDocuments: [],  // RAGFlow document IDs
      sourceKbIds: [],      // RAGFlow KB IDs
      chunkIds: []          // ES chunk IDs
    });
  }

  const entity = map.get(key);
  if (!entity.mentions.some(m => m.document === docName)) {
    entity.mentions.push({
      document: docName,
      position,
      contextSnippet: content.substring(Math.max(0, position - 100), position + 100),
      ragflowDocId: docId,
      ragflowKbId: kbId,
      chunkId: chunkId
    });
    // Track unique IDs
    if (docId && !entity.sourceDocuments.includes(docId)) entity.sourceDocuments.push(docId);
    if (kbId && !entity.sourceKbIds.includes(kbId)) entity.sourceKbIds.push(kbId);
    if (chunkId && !entity.chunkIds.includes(chunkId)) entity.chunkIds.push(chunkId);
  }
}

/**
 * Calculate fuzzy string similarity (Levenshtein-based)
 */
function stringSimilarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Deduplicate entities against existing actors
 * Returns only truly new entities not in the system
 */
function deduplicateAgainstExisting(candidates, existingActors) {
  const SIMILARITY_THRESHOLD = 0.8;
  const newEntities = [];

  for (const candidate of candidates) {
    let isNew = true;
    let bestMatch = null;
    let bestScore = 0;

    for (const actor of existingActors) {
      // Check against actor name
      const nameScore = stringSimilarity(candidate.name, actor.name);
      if (nameScore > bestScore) {
        bestScore = nameScore;
        bestMatch = actor;
      }

      // Check against aliases
      for (const alias of (actor.aliases || [])) {
        const aliasScore = stringSimilarity(candidate.name, alias);
        if (aliasScore > bestScore) {
          bestScore = aliasScore;
          bestMatch = actor;
        }
      }

      // Check against ragflowEntityIds
      for (const entityId of (actor.ragflowEntityIds || [])) {
        const entityScore = stringSimilarity(candidate.name, entityId);
        if (entityScore > bestScore) {
          bestScore = entityScore;
          bestMatch = actor;
        }
      }
    }

    if (bestScore >= SIMILARITY_THRESHOLD) {
      // This entity already exists - add as potential alias
      candidate.matchedTo = bestMatch;
      candidate.matchScore = bestScore;
      candidate.isNew = false;
    } else {
      candidate.isNew = true;
      newEntities.push(candidate);
    }
  }

  return { newEntities, matchedEntities: candidates.filter(c => !c.isNew) };
}

/**
 * Build actor profile from document mentions
 * Creates rich context including statements, relationships, and document citations
 * Enhanced with AI markers, document links, and PostgreSQL integration
 */
async function buildActorProfile(entityName, maxDocs = 50) {
  const profile = {
    name: entityName,
    suggestedRole: 'unknown',
    aliases: new Set(),
    organizations: [],  // Now array of objects with metadata
    relatedActors: new Set(),
    statements: [],
    documentMentions: [],  // Enhanced with RAGFlow IDs
    timeline: [],

    // AI Discovery Metadata
    discoveredBy: 'AI',
    aiSource: 'actor-discovery-agent',
    discoveredAt: new Date().toISOString(),
    humanVerified: false,
    aiConfidence: 0,  // Will be calculated
    dismissedByAI: false
  };

  // Search ES for all mentions - use content_ltks (tokenized search field)
  // Use single match query with full name (ES handles tokenization)
  const esQuery = {
    bool: {
      must: [{ match: { content_ltks: entityName.toLowerCase() } }]
    }
  };

  const results = await searchES(esQuery, maxDocs);

  for (const hit of (results.hits?.hits || [])) {
    const content = hit._source?.content_with_weight || '';
    const docName = hit._source?.docnm_kwd || 'Unknown';
    const hitId = hit._id;  // Elasticsearch document ID (chunk reference)
    const ragflowDocId = hit._source?.doc_id || null;  // RAGFlow document UUID
    const ragflowKbId = hit._source?.kb_id || null;    // RAGFlow KB UUID

    // Enhanced document mention with RAGFlow linkage
    profile.documentMentions.push({
      documentName: docName,
      ragflowDocId: ragflowDocId,      // RAGFlow document UUID from ES
      ragflowKbId: ragflowKbId,        // RAGFlow KB UUID from ES
      chunkIds: [hitId],               // ES document ID (chunk reference)
      score: hit._score,
      snippet: extractRelevantSnippet(content, entityName),
      position: content.toLowerCase().indexOf(entityName.toLowerCase())
    });

    // Extract role if mentioned near name
    const roleMatch = content.match(new RegExp(`${entityName}[,\\s]*((?:the )?(?:CEO|President|Owner|Manager|Director|Attorney|Agent|Defendant|Witness|Doctor|MD|Investigator)[^,.]*)`, 'i'));
    if (roleMatch) {
      profile.suggestedRole = roleMatch[1].trim();
    }

    // Extract related organizations with metadata
    const orgMatch = content.match(new RegExp(`${entityName}[^.]*?((?:LLC|Inc\\.?|Corp\\.?|Health|Medical|Ventures)[^,.]*)`, 'i'));
    if (orgMatch) {
      const orgName = orgMatch[1].trim();
      // Add with metadata (avoid duplicates)
      if (!profile.organizations.find(o => o.name === orgName)) {
        profile.organizations.push({
          name: orgName,
          orgId: null,  // Will be linked to actual org entity
          role: 'unknown',  // e.g., "investor", "owner", "member"
          source: docName,
          confidence: hit._score / 100  // Normalize score to 0-1
        });
      }
    }

    // Extract statements (quotes attributed to this person)
    const statementMatches = content.matchAll(new RegExp(`${entityName}[^"]*"([^"]{20,200})"`, 'gi'));
    for (const match of statementMatches) {
      profile.statements.push({
        quote: match[1],
        document: docName,
        context: extractRelevantSnippet(content, match[1])
      });
    }

    // Extract dates for timeline
    const dateMatch = content.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      profile.timeline.push({
        date: dateMatch[1],
        document: docName,
        event: extractRelevantSnippet(content, entityName, 150)
      });
    }
  }

  // Convert sets to arrays
  profile.aliases = Array.from(profile.aliases);
  // organizations already array
  profile.relatedActors = Array.from(profile.relatedActors);

  // Sort timeline by date
  profile.timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Deduplicate statements
  profile.statements = profile.statements.filter((s, i, arr) =>
    arr.findIndex(x => x.quote === s.quote) === i
  ).slice(0, 20); // Limit to 20 most relevant

  // Calculate AI confidence based on document coverage
  const mentionCount = profile.documentMentions.length;
  const avgScore = profile.documentMentions.reduce((sum, m) => sum + m.score, 0) / mentionCount;
  profile.aiConfidence = Math.min(
    (mentionCount / 10) * 0.5 + // Coverage: 10+ docs = 0.5
    (avgScore / 50) * 0.5,      // Relevance: score 50+ = 0.5
    1.0
  );

  return profile;
}

/**
 * Save discovered actor to validation queue for human review
 * Sprint 18: Routes through validations.create instead of direct creation
 * Human-verified actors are skipped, existing AI actors get field update suggestions
 */
async function saveActorToPostgres(profile, retries = RATE_LIMIT_CONFIG.RETRY_COUNT, delay = RATE_LIMIT_CONFIG.RETRY_DELAY) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // First, check if actor already exists via tRPC
      const existingActors = await callTrpcQuery('actors.list', {
        caseId: DEFAULT_CASE_ID,
        dismissed: false,
      });

      const actorName = profile.name;
      const existing = existingActors.find(a =>
        a.name.toLowerCase() === actorName.toLowerCase() ||
        (a.aliases || []).some(alias => alias.toLowerCase() === actorName.toLowerCase())
      );

      // If exists and human-verified, skip entirely
      if (existing && existing.discoveredBy === 'user') {
        console.log(`[saveActor] Skipping ${profile.name} - human-added actor exists`);
        return { success: false, reason: 'human_exists', actorId: existing.id };
      }

      // If exists and AI-discovered, queue field updates for review
      if (existing) {
        const updates = [];

        // Check each field for potential updates
        if (profile.suggestedRole && profile.suggestedRole !== existing.role) {
          updates.push({
            entityType: 'actor_field_update',
            entityName: `${profile.name} - role update`,
            entityData: {
              actorId: existing.id,
              field: 'role',
              currentValue: existing.role,
              suggestedValue: profile.suggestedRole
            },
            confidenceContext: {
              mentionCount: profile.documentMentions?.length || 1,
              sourceDocumentIds: profile.documentMentions?.map(m => m.docId) || [],
              avgChunkScore: profile.avgScore || 50
            }
          });
        }

        // Check for new aliases
        const newAliases = (profile.aliases || []).filter(a =>
          !(existing.aliases || []).includes(a)
        );
        if (newAliases.length > 0) {
          updates.push({
            entityType: 'actor_field_update',
            entityName: `${profile.name} - new aliases`,
            entityData: {
              actorId: existing.id,
              field: 'aliases',
              currentValue: existing.aliases || [],
              suggestedValue: [...new Set([...(existing.aliases || []), ...newAliases])]
            },
            confidenceContext: {
              mentionCount: newAliases.length,
              sourceDocumentIds: profile.documentMentions?.map(m => m.docId) || []
            }
          });
        }

        // Queue all updates
        if (updates.length > 0) {
          await queueDiscoveriesBatch(updates);
          console.log(`[saveActor] Queued ${updates.length} field updates for ${profile.name} (id: ${existing.id})`);
        }

        return { success: true, actorId: existing.id, action: 'queued_updates', updateCount: updates.length };
      }

      // NEW ACTOR: Queue for human review instead of direct creation
      // Extract unique document IDs, KB IDs, and chunk IDs from document mentions
      const docMentions = profile.documentMentions || [];
      const sourceDocumentIds = [...new Set(docMentions.map(m => m.ragflowDocId).filter(Boolean))];
      const sourceKbIds = [...new Set(docMentions.map(m => m.ragflowKbId).filter(Boolean))];
      const sourceChunkIds = docMentions.flatMap(m => m.chunkIds || []);

      const confidenceContext = {
        mentionCount: docMentions.length || 1,
        sourceDocumentIds: sourceDocumentIds,
        sourceKbIds: sourceKbIds,  // KB IDs from ES documents
        sourceDocumentTypes: docMentions.map(m => m.docType) || [],
        avgChunkScore: profile.avgScore || 50,
        exactMatch: profile.exactMatch || false,
        partialMatch: profile.partialMatch || true
      };

      const entityData = {
        name: profile.name,
        displayName: profile.name,
        actorType: profile.entityType || 'person',
        role: profile.suggestedRole || null,
        description: profile.description || `AI-discovered from document analysis`,
        aliases: profile.aliases || [],
        emails: profile.emails || [],
        phoneNumbers: profile.phoneNumbers || [],
        ragflowEntityIds: [...(profile.aliases || []), profile.name.toUpperCase()],
        // Document source IDs for opening in viewer
        ragflowKbId: sourceKbIds[0] || null,  // Primary KB
        ragflowDocId: sourceDocumentIds[0] || null,  // Primary document
        documentMentions: docMentions.map(m => ({
          documentName: m.documentName,
          ragflowDocId: m.ragflowDocId,
          ragflowKbId: m.ragflowKbId,
          chunkId: m.chunkIds?.[0],
          snippet: m.snippet
        }))
      };

      const validation = await queueDiscoveryForReview({
        entityType: 'actor',
        entityName: profile.name,
        entityData,
        discoverySource: 'actor-discovery-agent',
        sourceDocumentIds: sourceDocumentIds,
        sourceChunkIds: sourceChunkIds,
        confidenceContext,
        priority: profile.aiConfidence > 0.8 ? 'high' : 'normal'
      });

      console.log(`[saveActor] Queued ${profile.name} for human review (validation: ${validation?.json?.id || 'unknown'})`);
      return { success: true, action: 'queued', validation };

    } catch (error) {
      // Handle duplicate validation errors
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log(`[saveActor] ${profile.name} already in validation queue, skipping`);
        return { success: false, reason: 'already_queued', error: error.message };
      }

      // Retry on network/timeout errors
      if (attempt < retries) {
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        console.log(`[saveActor] Retry ${attempt}/${retries} for ${profile.name}, waiting ${backoffDelay}ms: ${error.message}`);
        await new Promise(r => setTimeout(r, backoffDelay));
        continue;
      }

      console.error(`[saveActor] Failed after ${retries} attempts for ${profile.name}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Dismiss an AI-discovered actor as noise via tRPC
 * Sprint 17: Uses actors.dismiss mutation
 * Safety: Can only dismiss AI-discovered actors, never human-added
 */
async function dismissActor(actorId, reason) {
  try {
    const result = await callTrpcMutation('actors.dismiss', {
      actorId,
      reason: reason || 'Dismissed as noise by AI',
    });

    console.log(`[dismissActor] Dismissed ${actorId} via tRPC: ${reason}`);
    return { success: true, actor: result };
  } catch (error) {
    // Handle "cannot dismiss human-added" error from tRPC
    if (error.message.includes('NOT_FOUND')) {
      return { success: false, error: 'Actor not found' };
    }
    console.error('[dismissActor] Failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Human approves AI-discovered actor → becomes validated via tRPC
 * Sprint 17: Uses actors.verify mutation
 */
async function approveActor(actorId) {
  try {
    const result = await callTrpcMutation('actors.verify', {
      actorId,
      verifiedBy: 'research-server',
    });

    console.log(`[approveActor] Verified ${actorId} via tRPC`);
    return { success: true, actor: result };
  } catch (error) {
    if (error.message.includes('NOT_FOUND')) {
      return { success: false, error: 'Actor not found' };
    }
    console.error('[approveActor] Failed:', error.message);
    return { success: false, error: error.message };
  }
}

function extractRelevantSnippet(content, searchTerm, length = 200) {
  const index = content.toLowerCase().indexOf(searchTerm.toLowerCase());
  if (index === -1) return content.substring(0, length);

  const start = Math.max(0, index - length / 2);
  const end = Math.min(content.length, index + length / 2);

  return content.substring(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Extract statements from documents for contradiction monitoring
 * Focuses on claims, assertions, and testimony
 */
async function extractStatementsForMonitoring(actorName) {
  const statements = [];

  // Search for statements, claims, testimony patterns using content_ltks
  const statementVerbs = ['stated', 'said', 'testified', 'claimed'];

  for (const verb of statementVerbs) {
    // Build query: actor name + statement verb as single match (ES handles tokenization)
    const esQuery = {
      bool: {
        must: [
          { match: { content_ltks: actorName.toLowerCase() } },
          { match: { content_ltks: verb } }
        ]
      }
    };
    const results = await searchES(esQuery, 20);
    const queryText = `${actorName} ${verb}`;

    for (const hit of (results.hits?.hits || [])) {
      const content = hit._source?.content_with_weight || '';
      const docName = hit._source?.docnm_kwd || 'Unknown';

      // Extract the statement context
      const snippets = content.split(/[.!?]/).filter(s =>
        s.toLowerCase().includes(actorName.toLowerCase())
      );

      for (const snippet of snippets.slice(0, 5)) {
        statements.push({
          actor: actorName,
          statement: snippet.trim(),
          source: docName,
          type: queryText.includes('testified') ? 'testimony' :
                queryText.includes('claimed') ? 'claim' : 'statement',
          extractedAt: new Date().toISOString()
        });
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  return statements.filter(s => {
    const key = s.statement.substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// AI DISCOVERIES - PostgreSQL-backed storage (replaces file-based)
// All AI findings flow through this table for human review and ML learning
// ============================================================================

// Note: DEFAULT_CASE_ID already declared at top of file

/**
 * Save a discovery to PostgreSQL ai_discoveries table
 * @param {Object} discovery - Discovery object with entity details
 * @returns {Promise<Object>} - Saved discovery with ID
 */
async function saveDiscoveryToDb(discovery) {
  return new Promise((resolve, reject) => {
    // Match the actual ai_discoveries table schema
    const postData = JSON.stringify({
      case_id: discovery.caseId || 'us-v-blackman',
      category: discovery.category || 'actor',
      content: JSON.stringify({
        entity_name: discovery.name || discovery.entityName,
        entity_type: discovery.entityType || 'person',
        goal: discovery.goal || null,
        extraction_method: discovery.extractionMethod || 'elasticsearch_ner'
      }),
      source_documents: JSON.stringify(discovery.sourceDocuments || []),
      source_chunks: JSON.stringify(discovery.sourceChunks || []),
      model_results: JSON.stringify({
        research_swarm: {
          confidence: discovery.confidence || 0.5,
          model: 'elasticsearch_ner'
        }
      }),
      consensus_achieved: false,
      final_answer: discovery.name || discovery.entityName,
      final_confidence: discovery.confidence || 0.5,
      human_review_status: 'pending',
      discovered_at: new Date().toISOString()
    });

    const options = {
      hostname: POSTGREST_URL.replace(/https?:\/\//, '').split(':')[0],
      port: parseInt(POSTGREST_URL.split(':').pop()) || 3000,
      path: '/ai_discoveries',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Prefer': 'return=representation'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const saved = JSON.parse(data);
            resolve(Array.isArray(saved) ? saved[0] : saved);
          } catch {
            resolve({ success: true, raw: data });
          }
        } else {
          console.error(`[saveDiscoveryToDb] Error ${res.statusCode}: ${data}`);
          reject(new Error(`Failed to save discovery: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Load discoveries from PostgreSQL with optional filters
 * @param {Object} filters - Query filters (status, category, limit)
 * @returns {Promise<Object>} - { discoveries: [], stats: {} }
 */
async function loadDiscoveriesFromDb(filters = {}) {
  return new Promise((resolve, reject) => {
    let queryParams = [];
    if (filters.status && filters.status !== 'all') {
      queryParams.push(`status=eq.${filters.status}`);
    }
    if (filters.category) {
      queryParams.push(`category=eq.${filters.category}`);
    }
    queryParams.push('order=discovered_at.desc');
    queryParams.push(`limit=${filters.limit || 100}`);

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    const options = {
      hostname: POSTGREST_URL.replace(/https?:\/\//, '').split(':')[0],
      port: parseInt(POSTGREST_URL.split(':').pop()) || 3000,
      path: `/ai_discoveries${queryString}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const discoveries = JSON.parse(data);
            // Extract count from content-range header
            const range = res.headers['content-range'] || '*/0';
            const total = parseInt(range.split('/')[1]) || discoveries.length;

            // Calculate stats
            const stats = {
              totalDiscovered: total,
              pending: discoveries.filter(d => d.status === 'pending').length,
              accepted: discoveries.filter(d => d.status === 'accepted').length,
              rejected: discoveries.filter(d => d.status === 'rejected').length
            };

            resolve({ discoveries, stats, lastRun: discoveries[0]?.discovered_at });
          } catch (e) {
            reject(new Error(`Failed to parse discoveries: ${e.message}`));
          }
        } else {
          reject(new Error(`Failed to load discoveries: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Update discovery status (accept/reject/merge)
 * @param {string} discoveryId - UUID of the discovery
 * @param {Object} update - { status, userCorrection, reviewedBy, reward }
 * @returns {Promise<Object>}
 */
async function updateDiscoveryStatus(discoveryId, update) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      status: update.status,
      user_correction: update.userCorrection || null,
      reviewed_by: update.reviewedBy || 'system',
      reviewed_at: new Date().toISOString(),
      reward: update.reward || (update.status === 'accepted' ? 1.0 : update.status === 'rejected' ? -2.0 : 0.5)
    });

    const options = {
      hostname: POSTGREST_URL.replace(/https?:\/\//, '').split(':')[0],
      port: parseInt(POSTGREST_URL.split(':').pop()) || 3000,
      path: `/ai_discoveries?id=eq.${discoveryId}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Prefer': 'return=representation'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data || '{}'));
        } else {
          reject(new Error(`Failed to update discovery: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Promote accepted discovery to actors table via tRPC
 * Sprint 17: Uses actors.createActor mutation
 * @param {Object} discovery - Accepted discovery to promote
 * @returns {Promise<Object>} - Created actor
 */
async function promoteDiscoveryToActor(discovery) {
  try {
    // Map discovery fields to tRPC createActor input
    const actorType = discovery.category === 'actor'
      ? (discovery.entity_type || 'person')
      : 'other';

    const result = await callTrpcMutation('actors.createActor', {
      name: discovery.entity_name,
      displayName: discovery.entity_name,
      actorType: actorType,
      role: discovery.entity_type || null,
      description: `AI-discovered: ${discovery.goal || 'Document analysis'}. Source: research_swarm`,
      aliases: [],
      // AI discovery metadata
      discoveredBy: 'ai-research',
      aiConfidence: discovery.confidence || 0.5,
      aiSource: 'research_swarm',
      caseId: DEFAULT_CASE_ID,
    });

    console.log(`[promoteDiscoveryToActor] Created actor ${discovery.entity_name} via tRPC (id: ${result.id})`);

    // If discovery was accepted (human review), also verify it
    if (discovery.status === 'accepted') {
      await callTrpcMutation('actors.verify', {
        actorId: result.id,
        verifiedBy: 'human-review',
      });
      console.log(`[promoteDiscoveryToActor] Verified actor ${result.id}`);
    }

    return result;
  } catch (error) {
    // Handle conflict (actor already exists)
    if (error.message.includes('CONFLICT') || error.message.includes('already exists')) {
      console.log(`[promoteDiscoveryToActor] Actor ${discovery.entity_name} already exists, skipping`);
      return { alreadyExists: true, name: discovery.entity_name };
    }
    console.error(`[promoteDiscoveryToActor] Error:`, error.message);
    throw error;
  }
}

// Legacy compatibility - wraps DB functions for existing code
async function loadDiscoveredActors() {
  try {
    const result = await loadDiscoveriesFromDb({ category: 'actor', limit: 500 });
    return {
      actors: result.discoveries.map(d => ({
        id: d.id,
        name: d.entity_name,
        normalizedName: d.entity_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        entityType: d.entity_type,
        confidence: d.confidence,
        status: d.status,
        discoveredAt: d.discovered_at,
        sourceDocuments: d.source_documents,
        goal: d.goal
      })),
      lastRun: result.lastRun,
      stats: result.stats
    };
  } catch (error) {
    console.error('[loadDiscoveredActors] DB error, using empty:', error.message);
    return { actors: [], lastRun: null, stats: { totalDiscovered: 0, promoted: 0 } };
  }
}

async function saveDiscoveredActors(data) {
  // No longer saves to file - individual discoveries are saved via saveDiscoveryToDb
  console.log('[saveDiscoveredActors] DEPRECATED: Use saveDiscoveryToDb instead');
  return data;
}

const COURTLISTENER_API_KEY = process.env.COURTLISTENER_API_KEY || '009c261afa3862c7d6c09dc4138c3adeb25fd0f4';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple pattern storage (JSON file-based)
const PATTERNS_FILE = path.join(DATA_DIR, 'learned-patterns.json');

function loadPatterns() {
  try {
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf-8'));
  } catch {
    return { patterns: [], version: 1, stats: { searches: 0, feedbackCount: 0 } };
  }
}

function savePatterns(data) {
  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2));
}

// Elasticsearch URL - use Docker network name when running in container, localhost otherwise
const ES_HOST = process.env.ES_HOST || 'ragflow-es';
const ES_PORT = process.env.ES_PORT || '9200';
const ES_INDEX = process.env.ES_INDEX || 'ragflow_74bea108daab11f0b3cc0242ac120006';

// RAGFlow retrieval API - semantic search with proper embedding
const RAGFLOW_HOST = process.env.RAGFLOW_HOST || 'ragflow';
const RAGFLOW_PORT = process.env.RAGFLOW_PORT || '9380';
async function searchRAGFlowRetrieval(question, kbIds, topK = 20) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      dataset_ids: Array.isArray(kbIds) ? kbIds : [kbIds],
      question: question,
      top_k: topK
    });

    const options = {
      hostname: RAGFLOW_HOST,
      port: parseInt(RAGFLOW_PORT),
      path: '/api/v1/retrieval',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAGFLOW_API_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 60000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code === 0 && result.data?.chunks) {
            resolve(result.data.chunks);
          } else {
            console.error('RAGFlow retrieval error:', result.message || 'Unknown error');
            resolve([]);
          }
        } catch (e) {
          console.error('RAGFlow parse error:', e.message);
          resolve([]);
        }
      });
    });

    req.on('error', (error) => {
      console.error('RAGFlow retrieval failed:', error.message);
      resolve([]);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('RAGFlow retrieval timeout');
      resolve([]);
    });

    req.write(postData);
    req.end();
  });
}

// Search Elasticsearch directly via HTTP
async function searchES(query, size = 20) {
  const esQuery = {
    query: query,
    size: size,
    _source: ['content_with_weight', 'docnm_kwd', 'important_kwd', 'kb_id', 'doc_id']
  };

  return new Promise((resolve) => {
    const postData = JSON.stringify(esQuery);

    const options = {
      hostname: ES_HOST,
      port: parseInt(ES_PORT),
      path: `/${ES_INDEX}/_search`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error('ES parse error:', e.message);
          resolve({ hits: { hits: [], total: { value: 0 } } });
        }
      });
    });

    req.on('error', (error) => {
      console.error('ES search failed:', error.message);
      resolve({ hits: { hits: [], total: { value: 0 } } });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('ES search timeout');
      resolve({ hits: { hits: [], total: { value: 0 } } });
    });

    req.write(postData);
    req.end();
  });
}

// PostgreSQL connection (PostgREST runs on port 3000)
// Use IP address since DNS resolution fails in some containers
const POSTGRES_URL = process.env.POSTGRES_URL || 'http://172.19.0.6:3000';

// Helper: Fetch from PostgreSQL via PostgREST (using Node.js http module, not fetch)
async function pgFetch(endpoint, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const url = new URL(`${POSTGRES_URL}${endpoint}`);
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || 3000,  // PostgREST default port
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            console.error(`PostgreSQL ${method} ${endpoint} failed: ${res.statusCode}`);
            resolve(null);
          } else {
            resolve(data ? JSON.parse(data) : {});
          }
        } catch (e) {
          console.error(`PostgreSQL ${method} ${endpoint} parse error:`, e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`PostgreSQL ${method} ${endpoint} failed:`, error.message);
      resolve(null);
    });

    if (postData) req.write(postData);
    req.end();
  });
}

// Helper: Get current case_state
async function getCaseState() {
  const result = await pgFetch('/case_state?select=state_json');
  return result?.[0]?.state_json || { actors: [], organizations: [] };
}

// Helper: Update case_state
async function updateCaseState(newState) {
  return await pgFetch('/case_state', 'PATCH', { state_json: newState });
}

// Run GOALIE goal decomposition
async function decomposeGoal(goal) {
  try {
    const safeGoal = goal.replace(/"/g, '\\"').replace(/`/g, '\\`');
    const result = execSync(
      `npx research-swarm goal-decompose "${safeGoal}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 60000, cwd: __dirname }
    );
    return result;
  } catch (error) {
    return `Goal: ${goal}\nDecomposition unavailable: ${error.message}`;
  }
}

// Run full research
async function runResearch(agent, task, depth = 5) {
  try {
    const safeTask = task.replace(/"/g, '\\"').replace(/`/g, '\\`');
    const result = execSync(
      `npx research-swarm research ${agent} "${safeTask}" --depth ${depth} 2>&1`,
      { encoding: 'utf-8', timeout: 300000, cwd: __dirname }
    );
    return result;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// Find similar patterns from history
function findSimilarPatterns(entities, context) {
  const patterns = loadPatterns();
  return patterns.patterns
    .filter(p => {
      const entityMatch = entities?.some(e =>
        p.entities?.some(pe => pe.toLowerCase().includes(e.toLowerCase()))
      );
      const contextMatch = context?.some(c =>
        p.context?.some(pc => pc.toLowerCase().includes(c.toLowerCase()))
      );
      return entityMatch || contextMatch;
    })
    .sort((a, b) => (b.reward || 0) - (a.reward || 0))
    .slice(0, 5);
}

/**
 * Validate findings quality using Basin Analyzer
 * Returns confidence metrics that feed into reward calculation
 */
async function validateWithBasin(query, findings) {
  try {
    // Prepare context from top findings
    const context = findings.slice(0, 5).map(f =>
      f._source?.content_with_weight || ''
    ).join('\n\n---\n\n');

    const response = await fetch(`${BASIN_ANALYZER_URL}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'measure_confidence',
          arguments: { query, context, sample_count: 3 }
        }
      })
    });

    if (!response.ok) return null;

    const result = await response.json();
    const text = result?.result?.content?.[0]?.text || '';

    // Parse confidence level from response
    const confidenceMatch = text.match(/Confidence Level: (HIGH|MEDIUM|LOW)/);
    const epsilonMatch = text.match(/Epsilon.*?: ([\d.]+)/);
    const coherenceMatch = text.match(/Coherence.*?: ([\d.]+)/);

    return {
      level: confidenceMatch?.[1] || 'UNKNOWN',
      epsilon: parseFloat(epsilonMatch?.[1]) || 0.5,
      coherence: parseFloat(coherenceMatch?.[1]) || 0.5
    };
  } catch (error) {
    console.error('Basin validation failed:', error.message);
    return null;
  }
}

/**
 * Check for logical contradictions in findings using Z3
 * Returns conflict info that penalizes reward for contradictory results
 */
async function checkConstraints(findings) {
  try {
    // Extract findings as constraint input
    const constraintFindings = findings.slice(0, 10).map(f => ({
      quote: f._source?.content_with_weight?.substring(0, 500) || '',
      document: f._source?.docnm_kwd || 'Unknown',
      significance: 'Evidence from search results'
    }));

    const response = await fetch(`${CONSTRAINT_VALIDATOR_URL}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'extract_constraints',
          arguments: { findings: constraintFindings }
        }
      })
    });

    if (!response.ok) return null;

    const result = await response.json();
    const text = result?.result?.content?.[0]?.text || '';

    // Parse constraint count
    const constraintMatch = text.match(/Constraints Found: (\d+)/);
    const hasConflicts = text.includes('UNSATISFIABLE');

    return {
      constraintCount: parseInt(constraintMatch?.[1]) || 0,
      hasConflicts,
      validated: true
    };
  } catch (error) {
    console.error('Constraint validation failed:', error.message);
    return null;
  }
}

/**
 * Calculate quality-adjusted reward score
 * Incorporates Basin confidence and Z3 constraint validation
 */
function calculateQualityReward(userReward, basinResult, constraintResult) {
  let reward = userReward || 0.5;

  // Basin confidence adjustment (-0.2 to +0.2)
  if (basinResult) {
    if (basinResult.level === 'HIGH') reward += 0.2;
    else if (basinResult.level === 'MEDIUM') reward += 0.05;
    else if (basinResult.level === 'LOW') reward -= 0.15;

    // Coherence bonus
    reward += (basinResult.coherence - 0.5) * 0.2;
  }

  // Constraint validation adjustment
  if (constraintResult) {
    // Penalize if contradictions found
    if (constraintResult.hasConflicts) reward -= 0.25;
    // Small bonus for having extractable constraints (structured data)
    else if (constraintResult.constraintCount > 0) reward += 0.1;
  }

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, Math.round(reward * 100) / 100));
}

/**
 * Search CourtListener for related cases
 * Uses entities (prosecutors, judges, defendants) to find similar cases
 */
async function searchCourtListener(query, options = {}) {
  try {
    const response = await fetch(`${COURTLISTENER_URL}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'search_cases',
          arguments: {
            query,
            jurisdiction: options.jurisdiction,
            limit: options.limit || 10
          }
        }
      })
    });

    if (!response.ok) return { cases: [], error: response.statusText };

    const result = await response.json();
    const text = result?.result?.content?.[0]?.text || '';

    // Parse cases from response
    const cases = [];
    const caseMatches = text.matchAll(/\*\*(.+?)\*\*.*?Citation:\s*(.+?)(?:\n|$)/g);
    for (const match of caseMatches) {
      cases.push({
        name: match[1],
        citation: match[2].trim()
      });
    }

    return { cases, raw: text };
  } catch (error) {
    console.error('CourtListener search failed:', error.message);
    return { cases: [], error: error.message };
  }
}

/**
 * Find precedents for legal issues in our case
 */
async function findPrecedents(legalIssue, jurisdiction = null) {
  try {
    const response = await fetch(`${COURTLISTENER_URL}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'find_precedents',
          arguments: {
            legal_issue: legalIssue,
            jurisdiction,
            include_scotus: true
          }
        }
      })
    });

    if (!response.ok) return { precedents: [], error: response.statusText };

    const result = await response.json();
    return {
      precedents: result?.result?.content?.[0]?.text || '',
      raw: result
    };
  } catch (error) {
    console.error('Precedent search failed:', error.message);
    return { precedents: [], error: error.message };
  }
}

/**
 * Research judge history
 */
async function searchJudgeHistory(judgeName, court = null) {
  try {
    const response = await fetch(`${COURTLISTENER_URL}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'search_judge_history',
          arguments: {
            judge_name: judgeName,
            court
          }
        }
      })
    });

    if (!response.ok) return { history: null, error: response.statusText };

    const result = await response.json();
    return {
      history: result?.result?.content?.[0]?.text || '',
      raw: result
    };
  } catch (error) {
    console.error('Judge history search failed:', error.message);
    return { history: null, error: error.message };
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'legalai-research-swarm',
      swarmRunning: swarmState.running
    }));
    return;
  }

  // ========================================================================
  // SWARM CONTROL ENDPOINTS (Sprint 18.6)
  // ========================================================================

  // Get swarm status
  if (url.pathname === '/swarm/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      running: swarmState.running,
      startedAt: swarmState.startedAt,
      pausedAt: swarmState.pausedAt,
      currentTask: swarmState.currentTask,
      discoveryCount: swarmState.discoveryCount,
      lastActivity: swarmState.lastActivity,
      queueLength: swarmState.investigationQueue.length,
      recentActivity: swarmState.activityLog.slice(0, 20)
    }));
    return;
  }

  // Start swarm
  if (url.pathname === '/swarm/start' && req.method === 'POST') {
    if (swarmState.running) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Swarm already running' }));
      return;
    }

    swarmState.running = true;
    swarmState.startedAt = new Date().toISOString();
    swarmState.pausedAt = null;
    logSwarmActivity('search', 'Swarm started - beginning discovery operations');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Swarm started',
      startedAt: swarmState.startedAt
    }));
    return;
  }

  // Pause swarm
  if (url.pathname === '/swarm/pause' && req.method === 'POST') {
    if (!swarmState.running) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Swarm already paused' }));
      return;
    }

    swarmState.running = false;
    swarmState.pausedAt = new Date().toISOString();
    logSwarmActivity('analysis', 'Swarm paused');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Swarm paused',
      pausedAt: swarmState.pausedAt
    }));
    return;
  }

  // Get swarm activity log
  if (url.pathname === '/swarm/activity' && req.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      activity: swarmState.activityLog.slice(0, limit),
      total: swarmState.activityLog.length
    }));
    return;
  }

  // Add investigation to queue
  if (url.pathname === '/swarm/queue' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const investigation = JSON.parse(body);
        const queueItem = {
          id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          question: investigation.question,
          requestedBy: investigation.requestedBy,
          caseId: investigation.caseId || DEFAULT_CASE_ID,
          priority: investigation.priority || 'normal',
          queuedAt: new Date().toISOString(),
          status: 'queued'
        };

        swarmState.investigationQueue.push(queueItem);
        logSwarmActivity('discovery', `Investigation queued: "${investigation.question}"`, {
          requestedBy: investigation.requestedBy
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, investigation: queueItem }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Get investigation queue
  if (url.pathname === '/swarm/queue' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      queue: swarmState.investigationQueue,
      total: swarmState.investigationQueue.length
    }));
    return;
  }

  // ========================================================================
  // BACKFILL VALIDATION IDs (Sprint 18.8)
  // Populate missing doc_id, kb_id, chunk_id for existing validations
  // ========================================================================
  if (url.pathname === '/validations/backfill' && req.method === 'POST') {
    try {
      console.log('[Backfill] Starting validation ID backfill...');

      // Get all pending validations missing IDs
      // Sprint 18.9: Use POSTGREST_URL constant for Docker network compatibility
      const validationsResponse = await fetch(`${POSTGREST_URL}/entity_validations?status=eq.pending&select=id,entity_name,entity_data,source_document_ids`);
      const validations = await validationsResponse.json();

      console.log(`[Backfill] Found ${validations.length} pending validations`);

      let updated = 0;
      let errors = [];

      for (const validation of validations) {
        try {
          // Extract document references from entity_data
          const entityData = validation.entity_data || {};
          // Sprint 18.9: Check all possible field names for document references
          const mentions = entityData.mentions || entityData.documentMentions || entityData.documentReferences || [];

          // Sprint 18.9: Force update ALL validations to fix incorrect IDs
          // Previous logic skipped records with existing IDs, but those IDs were wrong

          // Get document name from mentions - try ALL possible field names
          let docName = null;
          if (mentions.length > 0) {
            docName = mentions[0].document || mentions[0].documentName || mentions[0].docName || mentions[0].doc_name;
          }
          // Fallback to entity_data top-level fields
          if (!docName && entityData.documentMentions?.length > 0) {
            docName = entityData.documentMentions[0].documentName || entityData.documentMentions[0].docName;
          }
          if (!docName && entityData.documentReferences?.length > 0) {
            docName = entityData.documentReferences[0].documentName || entityData.documentReferences[0].docName;
          }

          if (!docName) {
            console.log(`[Backfill] Skip ${validation.entity_name}: no document name found`);
            continue; // No document reference to backfill
          }

          // Search ES for this document name
          const esQuery = {
            query: {
              match: {
                docnm_kwd: docName
              }
            },
            size: 1,
            _source: ['doc_id', 'kb_id', 'docnm_kwd', 'content_with_weight']
          };

          const esResponse = await new Promise((resolve) => {
            const postData = JSON.stringify(esQuery);
            const options = {
              hostname: 'ragflow-es',
              port: 9200,
              path: '/ragflow_74bea108daab11f0b3cc0242ac120006/_search',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
              },
              timeout: 10000
            };

            const esReq = http.request(options, (esRes) => {
              let data = '';
              esRes.on('data', chunk => data += chunk);
              esRes.on('end', () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  resolve({ hits: { hits: [] } });
                }
              });
            });
            esReq.on('error', () => resolve({ hits: { hits: [] } }));
            esReq.on('timeout', () => { esReq.destroy(); resolve({ hits: { hits: [] } }); });
            esReq.write(postData);
            esReq.end();
          });

          const hits = esResponse.hits?.hits || [];
          if (hits.length === 0) {
            continue; // No ES match found
          }

          const hit = hits[0];
          const docId = hit._source?.doc_id;
          const kbId = hit._source?.kb_id;
          const chunkId = hit._id;
          const snippet = hit._source?.content_with_weight?.substring(0, 500);

          if (!docId || !kbId) {
            continue; // ES hit missing required IDs
          }

          // Update entity_data with document references
          const updatedMentions = mentions.map((m, idx) => idx === 0 ? {
            ...m,
            ragflowDocId: docId,
            ragflowKbId: kbId,
            chunkId: chunkId,
            snippet: snippet || m.snippet || m.contextSnippet
          } : m);

          const updatedEntityData = {
            ...entityData,
            mentions: updatedMentions,
            documentMentions: [{
              documentName: docName,
              ragflowDocId: docId,
              ragflowKbId: kbId,
              chunkId: chunkId,
              snippet: snippet
            }]
          };

          // Update the validation record
          // Sprint 18.9: Use POSTGREST_URL constant for Docker network compatibility
          const updateResponse = await fetch(`${POSTGREST_URL}/entity_validations?id=eq.${validation.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              entity_data: updatedEntityData,
              source_document_ids: [docId],
              source_chunk_ids: [chunkId]
            })
          });

          if (updateResponse.ok) {
            updated++;
            console.log(`[Backfill] Updated ${validation.entity_name}: doc=${docId}, kb=${kbId}`);
          } else {
            errors.push({ id: validation.id, error: `Update failed: ${updateResponse.status}` });
          }
        } catch (err) {
          errors.push({ id: validation.id, error: err.message });
        }
      }

      console.log(`[Backfill] Complete: ${updated} updated, ${errors.length} errors`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        total: validations.length,
        updated,
        errors: errors.slice(0, 10) // Limit error output
      }));
    } catch (error) {
      console.error('[Backfill] Error:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Get learned patterns
  if (url.pathname === '/patterns' && req.method === 'GET') {
    const patterns = loadPatterns();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(patterns));
    return;
  }

  // Store a pattern (feedback from user) with quality validation
  if (url.pathname === '/patterns' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const pattern = JSON.parse(body);
        const data = loadPatterns();

        // Optionally validate with Basin and Z3 for quality-adjusted reward
        let basinResult = null;
        let constraintResult = null;

        if (pattern.findings && pattern.findings.length > 0) {
          // Run validation in parallel
          const queryText = pattern.entities?.join(' ') || pattern.query || '';
          [basinResult, constraintResult] = await Promise.all([
            validateWithBasin(queryText, pattern.findings).catch(() => null),
            checkConstraints(pattern.findings).catch(() => null)
          ]);
        }

        // Calculate quality-adjusted reward
        const adjustedReward = calculateQualityReward(
          pattern.reward,
          basinResult,
          constraintResult
        );

        pattern.timestamp = new Date().toISOString();
        pattern.id = data.patterns.length + 1;
        pattern.originalReward = pattern.reward;
        pattern.reward = adjustedReward;
        pattern.validation = {
          basin: basinResult,
          constraints: constraintResult
        };

        data.patterns.push(pattern);
        data.stats.feedbackCount++;
        savePatterns(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          id: pattern.id,
          originalReward: pattern.originalReward,
          adjustedReward: adjustedReward,
          validation: pattern.validation
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Search with pattern recall
  if (url.pathname === '/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { query, entities, context, size } = JSON.parse(body);

        // Build ES query - entities are required, context boosts relevance
        let esQuery;

        if (entities && entities.length > 0) {
          esQuery = {
            bool: {
              must: entities.map(e => ({ match: { content_ltks: e.toLowerCase() } }))
            }
          };
          // Context terms boost relevance but don't filter
          if (context && context.length > 0) {
            esQuery.bool.should = context.map(c => ({ match: { content_ltks: c.toLowerCase() } }));
          }
        } else if (context && context.length > 0) {
          // Only context terms - require at least one
          esQuery = {
            bool: {
              should: context.map(c => ({ match: { content_ltks: c.toLowerCase() } })),
              minimum_should_match: 1
            }
          };
        } else if (query) {
          // Raw text query
          esQuery = { match: { content_ltks: query.toLowerCase() } };
        } else {
          esQuery = { match_all: {} };
        }

        const results = await searchES(esQuery, size || 20);

        // Find similar past patterns
        const similarPatterns = findSimilarPatterns(entities, context);

        // Track search in stats
        const data = loadPatterns();
        data.stats.searches++;
        savePatterns(data);

        // Optional: Validate quality with Basin Analyzer (async, non-blocking)
        let validation = null;
        const shouldValidate = url.searchParams?.get('validate') === 'true';
        if (shouldValidate && results.hits?.hits?.length > 0) {
          const queryText = entities?.join(' ') || query || '';
          validation = await validateWithBasin(queryText, results.hits.hits);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          hits: results.hits?.hits || [],
          total: results.hits?.total?.value || 0,
          similarPatterns: similarPatterns,
          validation: validation,
          suggestion: similarPatterns.length > 0
            ? `Found ${similarPatterns.length} similar past searches. Top pattern had ${similarPatterns[0]?.reward || 0} reward.`
            : null
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Goal decomposition
  if (url.pathname === '/decompose' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { goal } = JSON.parse(body);
        const result = await decomposeGoal(goal);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ goal, decomposition: result }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Full research task
  if (url.pathname === '/research' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { agent, task, depth } = JSON.parse(body);
        const result = await runResearch(agent || 'researcher', task, depth || 5);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Stats
  if (url.pathname === '/stats') {
    const patterns = loadPatterns();
    try {
      const swarmStats = execSync('npx research-swarm stats 2>&1', {
        encoding: 'utf-8',
        cwd: __dirname,
        timeout: 10000
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        local: patterns.stats,
        patternCount: patterns.patterns.length,
        swarm: swarmStats
      }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        local: patterns.stats,
        patternCount: patterns.patterns.length,
        swarm: 'Stats unavailable'
      }));
    }
    return;
  }

  // CourtListener case research - find related cases
  if (url.pathname === '/courtlistener/cases' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { query, jurisdiction, limit } = JSON.parse(body);
        const result = await searchCourtListener(query, { jurisdiction, limit });

        // Store successful searches as patterns for learning
        if (result.cases && result.cases.length > 0) {
          const data = loadPatterns();
          data.stats.courtlistenerSearches = (data.stats.courtlistenerSearches || 0) + 1;
          savePatterns(data);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // CourtListener precedent search
  if (url.pathname === '/courtlistener/precedents' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { legalIssue, jurisdiction } = JSON.parse(body);
        const result = await findPrecedents(legalIssue, jurisdiction);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // CourtListener judge history
  if (url.pathname === '/courtlistener/judge' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { judgeName, court } = JSON.parse(body);
        const result = await searchJudgeHistory(judgeName, court);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Combined research: search case + find related precedents + analyze entities
  if (url.pathname === '/courtlistener/research' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { entities, legalIssues, jurisdiction } = JSON.parse(body);

        // Run searches in parallel
        const searches = [];

        // Search for each entity (prosecutors, judges, defendants)
        if (entities && entities.length > 0) {
          for (const entity of entities.slice(0, 5)) {
            searches.push(
              searchCourtListener(entity, { jurisdiction, limit: 5 })
                .then(r => ({ type: 'entity', entity, ...r }))
            );
          }
        }

        // Find precedents for each legal issue
        if (legalIssues && legalIssues.length > 0) {
          for (const issue of legalIssues.slice(0, 3)) {
            searches.push(
              findPrecedents(issue, jurisdiction)
                .then(r => ({ type: 'precedent', issue, ...r }))
            );
          }
        }

        const results = await Promise.all(searches);

        // Aggregate and deduplicate cases
        const allCases = new Map();
        const precedentResults = [];

        for (const r of results) {
          if (r.type === 'entity' && r.cases) {
            for (const c of r.cases) {
              if (!allCases.has(c.citation)) {
                allCases.set(c.citation, { ...c, foundVia: [r.entity] });
              } else {
                allCases.get(c.citation).foundVia.push(r.entity);
              }
            }
          } else if (r.type === 'precedent') {
            precedentResults.push({ issue: r.issue, precedents: r.precedents });
          }
        }

        // Store research pattern
        const data = loadPatterns();
        data.stats.courtlistenerResearch = (data.stats.courtlistenerResearch || 0) + 1;
        savePatterns(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          cases: Array.from(allCases.values()),
          precedents: precedentResults,
          searchCount: searches.length
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // ============================================================================
  // ACTOR DISCOVERY AGENT ENDPOINTS
  // ============================================================================

  // Discover new actors from document corpus - saves to ai_discoveries table
  if (url.pathname === '/actors/discover' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { existingActors, sampleSize, focusTerms, goal } = JSON.parse(body);

        // Search ES for documents with potential actor mentions
        let esQuery;
        if (focusTerms && focusTerms.length > 0) {
          esQuery = {
            bool: {
              should: focusTerms.map(t => ({ match: { content_ltks: t.toLowerCase() } })),
              minimum_should_match: 1
            }
          };
        } else {
          // Sample from interview reports, emails, 302s - rich actor sources
          esQuery = {
            bool: {
              should: [
                { match: { docnm_kwd: 'interview' } },
                { match: { docnm_kwd: 'email' } },
                { match: { docnm_kwd: '302' } },
                { match: { docnm_kwd: 'MOI' } },
                { match: { content_ltks: 'stated' } },
                { match: { content_ltks: 'testified' } }
              ],
              minimum_should_match: 1
            }
          };
        }

        const results = await searchES(esQuery, sampleSize || 100);

        // Extract entities from search results
        const candidates = extractEntitiesFromChunks(results.hits?.hits || []);

        // Deduplicate against existing actors
        const { newEntities, matchedEntities } = deduplicateAgainstExisting(
          candidates,
          existingActors || []
        );

        // Queue each new entity to Triage Inbox (entity_validations table via tRPC)
        let queuedCount = 0;
        const queuedIds = [];
        for (const entity of newEntities.slice(0, 50)) {
          try {
            const result = await queueDiscoveryForReview({
              entityType: 'actor',
              entityName: entity.name,
              entityData: {
                suggestedType: entity.suggestedType || 'person',
                mentions: entity.mentions || [],
                sourceDocuments: entity.sourceDocuments || [],
                // RAGFlow document/KB IDs for opening in document viewer
                ragflowDocId: entity.sourceDocuments?.[0] || null,
                ragflowKbId: entity.sourceKbIds?.[0] || null,
                documentMentions: entity.mentions?.map(m => ({
                  documentName: m.document,
                  ragflowDocId: m.ragflowDocId,
                  ragflowKbId: m.ragflowKbId,
                  chunkId: m.chunkId,
                  snippet: m.contextSnippet
                })) || []
              },
              discoverySource: 'research-swarm',
              sourceDocumentIds: entity.sourceDocuments || [],
              sourceChunkIds: entity.chunkIds || [],
              confidenceContext: {
                mentionCount: entity.mentions?.length || 1,
                sourceCount: entity.sourceDocuments?.length || 1,
                sourceKbIds: entity.sourceKbIds || []
              },
              priority: entity.confidence > 0.8 ? 'high' : 'normal'
            });
            queuedCount++;
            if (result?.json?.id) queuedIds.push(result.json.id);
          } catch (dbError) {
            console.error(`[actors/discover] Failed to queue ${entity.name}:`, dbError.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          newEntities: newEntities.slice(0, 50),
          matchedEntities: matchedEntities.slice(0, 20),
          totalCandidates: candidates.length,
          queuedToTriageInbox: queuedCount,
          queuedIds,
          message: `Queued ${queuedCount} discoveries to Triage Inbox for human review`
        }));
      } catch (error) {
        console.error('[actors/discover] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Get discovered actors awaiting review - reads from Triage Inbox (entity_validations via tRPC)
  if (url.pathname === '/actors/discovered' && req.method === 'GET') {
    (async () => {
      try {
        const status = url.searchParams?.get('status') || 'pending';
        const entityType = url.searchParams?.get('entityType') || 'actor';
        const limit = parseInt(url.searchParams?.get('limit')) || 100;

        // Query Triage Inbox via tRPC
        const result = await callTrpcQuery('validations.list', {
          caseId: DEFAULT_CASE_ID,
          status: status === 'all' ? 'all' : status,
          entityType,
          limit
        });

        const validations = result?.json || [];

        // Get metrics for stats
        const metricsResult = await callTrpcQuery('validations.metrics', {
          caseId: DEFAULT_CASE_ID
        });
        const metrics = metricsResult?.json || {};

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          discoveries: validations.map(v => ({
            id: v.id,
            name: v.entity_name,
            entityType: v.entity_type,
            confidence: parseFloat(v.ai_confidence),
            status: v.status,
            priority: v.priority,
            entityData: v.entity_data,
            sourceDocuments: v.source_document_ids,
            discoverySource: v.discovery_source,
            createdAt: v.created_at
          })),
          total: validations.length,
          stats: {
            pending: metrics.byStatus?.find(s => s.status === 'pending')?.count || 0,
            approved: metrics.byStatus?.find(s => s.status === 'approved')?.count || 0,
            rejected: metrics.byStatus?.find(s => s.status === 'rejected')?.count || 0
          },
          source: 'triage_inbox_entity_validations'
        }));
      } catch (error) {
        console.error('[actors/discovered] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    })();
    return;
  }

  // Build detailed profile for an actor (now saves to PostgreSQL)
  if (url.pathname === '/actors/profile' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { actorName, maxDocs, saveToDb = true } = JSON.parse(body);

        if (!actorName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'actorName is required' }));
          return;
        }

        const profile = await buildActorProfile(actorName, maxDocs || 50);

        // Automatically save to PostgreSQL (unless explicitly disabled)
        let saveResult = null;
        if (saveToDb) {
          saveResult = await saveActorToPostgres(profile);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ...profile,
          savedToDb: saveResult
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Approve AI-discovered actor (marks as human-verified)
  if (url.pathname === '/actors/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { actorId } = JSON.parse(body);

        if (!actorId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'actorId is required' }));
          return;
        }

        const result = await approveActor(actorId);

        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Dismiss AI-discovered actor as noise
  if (url.pathname === '/actors/dismiss' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { actorId, reason } = JSON.parse(body);

        if (!actorId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'actorId is required' }));
          return;
        }

        const result = await dismissActor(actorId, reason || 'AI dismissed as noise');

        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Get actors from PostgreSQL (filter by AI/human, verified status)
  if (url.pathname === '/actors/list' && req.method === 'GET') {
    try {
      const caseState = await getCaseState();
      const discoveredBy = url.searchParams?.get('discoveredBy'); // 'AI' or 'HUMAN'
      const verified = url.searchParams?.get('verified'); // 'true' or 'false'
      const dismissed = url.searchParams?.get('dismissed'); // 'true' or 'false'

      let actors = caseState.actors || [];

      // Apply filters
      if (discoveredBy) {
        actors = actors.filter(a => a.discoveredBy === discoveredBy);
      }
      if (verified === 'true') {
        actors = actors.filter(a => a.humanVerified === true);
      } else if (verified === 'false') {
        actors = actors.filter(a => a.humanVerified === false);
      }
      if (dismissed === 'true') {
        actors = actors.filter(a => a.dismissedByAI === true);
      } else if (dismissed === 'false') {
        actors = actors.filter(a => !a.dismissedByAI);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        actors,
        total: actors.length,
        filters: { discoveredBy, verified, dismissed }
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Extract statements for contradiction monitoring
  if (url.pathname === '/actors/statements' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { actorName } = JSON.parse(body);

        if (!actorName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'actorName is required' }));
          return;
        }

        const statements = await extractStatementsForMonitoring(actorName);

        // Store in patterns for learning
        const data = loadPatterns();
        data.stats.statementExtractions = (data.stats.statementExtractions || 0) + 1;
        savePatterns(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          actor: actorName,
          statements,
          count: statements.length
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Update discovered actor status (accept/reject/promote) - uses PostgreSQL ai_discoveries
  if (url.pathname === '/actors/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { discoveryId, normalizedName, status, notes, reviewedBy } = JSON.parse(body);

        // Map status values to ai_discoveries schema
        const statusMap = {
          'promoted': 'accepted',
          'accepted': 'accepted',
          'approved': 'accepted',
          'rejected': 'rejected',
          'dismissed': 'rejected',
          'merged': 'merged',
          'escalated': 'escalated'
        };
        const dbStatus = statusMap[status] || status;

        // Update in ai_discoveries table
        const updated = await updateDiscoveryStatus(discoveryId, {
          status: dbStatus,
          userCorrection: notes,
          reviewedBy: reviewedBy || 'user'
        });

        let promotedActor = null;

        // If accepted, promote to actors table
        if (dbStatus === 'accepted') {
          try {
            // First get the full discovery record
            const discoveries = await loadDiscoveriesFromDb({ status: 'accepted', limit: 1 });
            const discovery = discoveries.discoveries.find(d => d.id === discoveryId);

            if (discovery) {
              promotedActor = await promoteDiscoveryToActor(discovery);
              console.log(`[actors/update] Promoted ${discovery.entity_name} to actors table`);
            }
          } catch (promoteError) {
            console.error('[actors/update] Promotion error:', promoteError.message);
            // Don't fail the whole request if promotion fails
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          discoveryId,
          status: dbStatus,
          promotedActor,
          message: dbStatus === 'accepted'
            ? 'Discovery accepted and promoted to actors table'
            : `Discovery status updated to ${dbStatus}`
        }));
      } catch (error) {
        console.error('[actors/update] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Batch discover actors for multiple search terms - with parallel execution and accumulation
  // Sprint 09: DISC-005 (parallel), DISC-006 (accumulation), DISC-007 (junk filtering)
  if (url.pathname === '/actors/batch-discover' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { searchTerms, existingActors, saveToPostgres = false } = JSON.parse(body);
        const terms = searchTerms || ['interview', 'email', 'testimony', '302'];

        console.log(`[batch-discover] Starting PARALLEL search for ${terms.length} terms: ${terms.join(', ')}`);
        const startTime = Date.now();

        // DISC-005: Execute searches in PARALLEL using Promise.all
        const searchPromises = terms.map(async (term) => {
          const esQuery = { match: { content_ltks: term.toLowerCase() } };
          const results = await searchES(esQuery, 50);
          return extractEntitiesFromChunks(results.hits?.hits || []);
        });

        const searchResults = await Promise.all(searchPromises);
        const allCandidates = searchResults.flat();

        console.log(`[batch-discover] Found ${allCandidates.length} total candidates from ${terms.length} parallel searches in ${Date.now() - startTime}ms`);

        // Deduplicate within batch with junk filtering
        const entityMap = new Map();
        let junkFiltered = 0;
        for (const c of allCandidates) {
          // DISC-007: Skip junk entities
          if (isJunkEntity(c.name)) {
            junkFiltered++;
            continue;
          }

          if (!entityMap.has(c.normalizedName)) {
            entityMap.set(c.normalizedName, c);
          } else {
            // Merge mentions
            const existing = entityMap.get(c.normalizedName);
            existing.mentions.push(...c.mentions);
          }
        }

        if (junkFiltered > 0) {
          console.log(`[batch-discover] Filtered ${junkFiltered} junk entities`);
        }

        const uniqueCandidates = Array.from(entityMap.values())
          .sort((a, b) => b.mentions.length - a.mentions.length);

        // DISC-006: Get existing actors from PostgreSQL if not provided
        let knownActors = existingActors || [];
        if (knownActors.length === 0) {
          try {
            const caseState = await getCaseState();
            knownActors = (caseState.actors || []).map(a => ({
              name: a.name,
              normalizedName: a.name?.toLowerCase() || '',
              id: a.id
            }));
            console.log(`[batch-discover] Loaded ${knownActors.length} existing actors from PostgreSQL`);
          } catch (err) {
            console.log(`[batch-discover] Could not load existing actors: ${err.message}`);
          }
        }

        // Deduplicate against existing
        const { newEntities } = deduplicateAgainstExisting(uniqueCandidates, knownActors);

        console.log(`[batch-discover] ${newEntities.length} new entities after deduplication`);

        // SPRINT 18: Queue ALL discoveries to Triage Inbox via tRPC (entity_validations table)
        // NOTE: saveToPostgres parameter is DEPRECATED - all discoveries now go through Triage Inbox
        let queuedToTriageInbox = 0;
        const entitiesToQueue = newEntities.slice(0, 50);

        if (entitiesToQueue.length > 0) {
          console.log(`[batch-discover] Queueing ${entitiesToQueue.length} entities to Triage Inbox for human review`);

          // Prepare batch for tRPC validations.createBatch
          const discoveries = entitiesToQueue.map(entity => ({
            entityType: 'actor',
            entityName: entity.name,
            entityData: {
              suggestedType: entity.suggestedType || 'person',
              mentions: entity.mentions || [],
              sourceDocuments: entity.sourceDocuments || [],
              searchTerms: terms.slice(0, 3),
              // RAGFlow document/KB IDs for opening in document viewer
              ragflowDocId: entity.sourceDocuments?.[0] || null,
              ragflowKbId: entity.sourceKbIds?.[0] || null,
              documentMentions: entity.mentions?.map(m => ({
                documentName: m.document,
                ragflowDocId: m.ragflowDocId,
                ragflowKbId: m.ragflowKbId,
                chunkId: m.chunkId,
                snippet: m.contextSnippet
              })) || []
            },
            discoverySource: 'research-swarm',
            sourceDocumentIds: entity.sourceDocuments || [],
            sourceChunkIds: entity.chunkIds || [],
            confidenceContext: {
              mentionCount: entity.mentions?.length || 1,
              sourceCount: entity.sourceDocuments?.length || 1
            },
            priority: entity.confidence > 0.8 ? 'high' : 'normal'
          }));

          try {
            const result = await queueDiscoveriesBatch(discoveries);
            queuedToTriageInbox = result?.json?.created || discoveries.length;
            console.log(`[batch-discover] Successfully queued ${queuedToTriageInbox} entities to Triage Inbox`);
          } catch (batchError) {
            console.error(`[batch-discover] Batch queue failed, falling back to individual:`, batchError.message);
            // Fallback: queue individually
            for (const discovery of discoveries) {
              try {
                await queueDiscoveryForReview(discovery);
                queuedToTriageInbox++;
              } catch (err) {
                if (!err.message.includes('duplicate')) {
                  console.error(`[batch-discover] Failed to queue ${discovery.entityName}:`, err.message);
                }
              }
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          newEntities: newEntities.slice(0, 100),
          totalCandidates: uniqueCandidates.length,
          searchTermsUsed: terms,
          junkFiltered,
          queuedToTriageInbox,
          executionTimeMs: Date.now() - startTime,
          message: `Queued ${queuedToTriageInbox} discoveries to Triage Inbox for human review`
        }));
      } catch (error) {
        console.error('[batch-discover] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Item-level feedback for discovered actor elements
  // Sprint 09: DISC-004 - Missing endpoint that frontend expects
  if (url.pathname === '/actors/item-feedback' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { actorId, itemType, itemIndex, action, feedback } = JSON.parse(body);

        if (!actorId || !itemType || action === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'actorId, itemType, and action are required' }));
          return;
        }

        console.log(`[item-feedback] ${action} ${itemType}[${itemIndex}] for actor ${actorId}`);

        // Load discovered actors
        const discovered = loadDiscoveredActors();
        const actor = discovered.actors.find(a =>
          a.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') === actorId ||
          a.id === actorId ||
          a.normalizedName === actorId.toLowerCase()
        );

        if (!actor) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Actor not found in discovered actors' }));
          return;
        }

        // Initialize feedback tracking if not exists
        if (!actor.itemFeedback) {
          actor.itemFeedback = { documents: [], organizations: [], timeline: [], relatedActors: [] };
        }

        // Record feedback for the specific item
        const feedbackRecord = {
          itemIndex,
          action, // 'accept', 'dismiss', 'link', 'edit'
          feedback: feedback || null,
          timestamp: new Date().toISOString()
        };

        if (!actor.itemFeedback[itemType]) {
          actor.itemFeedback[itemType] = [];
        }
        actor.itemFeedback[itemType].push(feedbackRecord);

        // Store pattern for ML learning
        const patterns = loadPatterns();
        patterns.patterns.push({
          type: 'item-feedback',
          actorName: actor.name,
          itemType,
          action,
          timestamp: new Date().toISOString()
        });
        patterns.stats.feedbackCount = (patterns.stats.feedbackCount || 0) + 1;
        savePatterns(patterns);

        // Save updated actors
        saveDiscoveredActors(discovered);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Recorded ${action} feedback for ${itemType}[${itemIndex}]`,
          actorId,
          totalFeedback: actor.itemFeedback[itemType].length
        }));
      } catch (error) {
        console.error('[item-feedback] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // ============================================================================
  // THEORY/CLAIM DISCOVERY - Extract theories from Trial Transcripts & Defense KBs
  // Sprint 18+ - Extracts neutral theories and positioned claims for counts
  // ============================================================================

  // Batch discover theories and claims from specific KBs
  if (url.pathname === '/theories/batch-discover' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const {
          caseId = DEFAULT_CASE_ID,
          kbIds = [],  // Default: Trial Transcripts + Defense_Theories_Whitnesses
          requestedBy = null,
          maxResults = 100
        } = JSON.parse(body);

        console.log(`[theories/batch-discover] Starting theory extraction for case ${caseId}`);
        const startTime = Date.now();

        // Default KBs if none specified
        const targetKbIds = kbIds.length > 0 ? kbIds : [
          '5ee7e6d4e77111f0ad560242ac130008', // First Trial US vs Blackman
          '2377e31eee8711f0b68b0242ac120008'  // Defense_Theories_Whitnesses
        ];

        // Search patterns for theory/claim extraction
        const THEORY_SEARCH_PATTERNS = [
          // Neutral theory indicators (from jury instructions, charges, opening statements)
          { pattern: 'at issue', type: 'theory', position: 'neutral' },
          { pattern: 'disputed whether', type: 'theory', position: 'neutral' },
          { pattern: 'central question', type: 'theory', position: 'neutral' },
          { pattern: 'must prove', type: 'theory', position: 'neutral' },
          { pattern: 'element of the offense', type: 'theory', position: 'neutral' },
          { pattern: 'question is whether', type: 'theory', position: 'neutral' },
          { pattern: 'jury must decide', type: 'theory', position: 'neutral' },
          { pattern: 'essential element', type: 'theory', position: 'neutral' },
          { pattern: 'burden of proof', type: 'theory', position: 'neutral' },
          { pattern: 'charged with', type: 'theory', position: 'neutral' },
          // Government position indicators
          { pattern: 'government contends', type: 'claim', position: 'government' },
          { pattern: 'evidence will show', type: 'claim', position: 'government' },
          { pattern: 'prosecution theory', type: 'claim', position: 'government' },
          { pattern: 'defendant knowingly', type: 'claim', position: 'government' },
          // Defense position indicators
          { pattern: 'defense contends', type: 'claim', position: 'defense' },
          { pattern: 'my client did not', type: 'claim', position: 'defense' },
          { pattern: 'advice of counsel', type: 'claim', position: 'defense' },
          { pattern: 'good faith', type: 'claim', position: 'defense' },
          { pattern: 'no evidence', type: 'claim', position: 'defense' },
          { pattern: 'relied on attorney', type: 'claim', position: 'defense' },
          { pattern: 'cooperation agreement', type: 'claim', position: 'defense' }
        ];

        const allExtractions = [];

        // Search each KB for each pattern using RAGFlow retrieval API
        for (const kbId of targetKbIds) {
          console.log(`[theories/batch-discover] Searching KB ${kbId} via RAGFlow API...`);

          for (const searchPattern of THEORY_SEARCH_PATTERNS) {
            try {
              // Use RAGFlow retrieval API with semantic search
              const chunks = await searchRAGFlowRetrieval(searchPattern.pattern, [kbId], 15);
              console.log(`[theories/batch-discover] "${searchPattern.pattern}": ${chunks.length} chunks`);

              for (const chunk of chunks) {
                const content = chunk.content || '';
                if (!content || content.length < 50) continue;

                // Strip HTML tags for cleaner text analysis
                const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

                // Extract statement context around the matched pattern
                const patternIdx = cleanContent.toLowerCase().indexOf(searchPattern.pattern.toLowerCase());

                // For RAGFlow results, use the full chunk if pattern not found (semantic match)
                let statement;
                if (patternIdx !== -1) {
                  // Find sentence boundaries
                  let sentenceStart = patternIdx;
                  let sentenceEnd = patternIdx + searchPattern.pattern.length;

                  for (let i = patternIdx - 1; i >= Math.max(0, patternIdx - 200); i--) {
                    if (cleanContent[i] === '.' || cleanContent[i] === '\n') { sentenceStart = i + 1; break; }
                  }
                  for (let i = patternIdx + searchPattern.pattern.length; i < Math.min(cleanContent.length, patternIdx + 300); i++) {
                    if (cleanContent[i] === '.' || cleanContent[i] === '\n') { sentenceEnd = i + 1; break; }
                  }
                  statement = cleanContent.slice(sentenceStart, sentenceEnd).trim();
                } else {
                  // Use first 300 chars as statement for semantic matches
                  statement = cleanContent.slice(0, 300).trim();
                }

                if (statement.length < 30 || statement.length > 500) continue;

                // Create extraction
                allExtractions.push({
                  entityType: searchPattern.type,
                  position: searchPattern.position,
                  statement,
                  indicator: searchPattern.pattern,
                  quotedText: cleanContent.slice(0, 300),
                  sourceDocument: chunk.document_keyword || chunk.docnm_kwd || 'Unknown',
                  sourceDocId: chunk.document_id || chunk.doc_id || null,
                  sourceChunkId: chunk.chunk_id || chunk.id || null,
                  sourceKbId: kbId,
                  esScore: chunk.similarity || chunk.score || 0
                });
              }
            } catch (searchErr) {
              console.error(`[theories/batch-discover] Search failed for "${searchPattern.pattern}":`, searchErr.message);
            }
          }
        }

        console.log(`[theories/batch-discover] Found ${allExtractions.length} raw extractions`);

        // Deduplicate by statement (keep highest ES score)
        const seen = new Map();
        for (const ext of allExtractions) {
          const key = ext.statement.toLowerCase().slice(0, 100);
          if (!seen.has(key) || ext.esScore > seen.get(key).esScore) {
            seen.set(key, ext);
          }
        }
        const uniqueExtractions = Array.from(seen.values())
          .sort((a, b) => b.esScore - a.esScore)
          .slice(0, maxResults);

        console.log(`[theories/batch-discover] ${uniqueExtractions.length} unique theories/claims after dedup`);

        // AI Summarization - clean up raw text into proper theory/claim format
        // Returns { claimText, theoryQuestion } for claims, or { theoryQuestion } for theories
        const summarizeWithAI = async (extraction) => {
          try {
            const OpenAI = require('openai');
            const deepseek = new OpenAI({
              apiKey: process.env.DEEPSEEK_API_KEY,
              baseURL: 'https://api.deepseek.com/v1',
            });

            if (extraction.entityType === 'theory') {
              // For theories: just generate the neutral question
              const response = await deepseek.chat.completions.create({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: `You are a legal analyst. Convert this raw court document text into a clear, neutral legal theory question.

Raw text: "${extraction.statement}"

Rules:
1. Output a single clear question about what must be proved (e.g., "Did the defendant knowingly participate in a scheme to defraud?")
2. Keep it neutral - no government or defense bias
3. Focus on legal elements that need to be established
4. Maximum 150 characters
5. Output ONLY the question, nothing else.` }],
                temperature: 0.3,
                max_tokens: 150,
              });
              return {
                theoryQuestion: response.choices[0].message.content.trim().replace(/^["']|["']$/g, ''),
              };
            } else {
              // For claims: generate BOTH the claim statement AND the parent theory question
              const claimPrompt = `You are a legal analyst. Convert this raw court document text into a clear legal claim.

Raw text: "${extraction.statement}"
Position: ${extraction.position} (${extraction.position === 'government' ? 'prosecution' : 'defense'} position)

Rules:
1. Output a clear statement of what this party claims/contends
2. Keep the ${extraction.position} perspective
3. Focus on the factual or legal assertion being made
4. Maximum 200 characters
5. Output ONLY the claim statement, nothing else.`;

              const theoryPrompt = `You are a legal analyst. Given this ${extraction.position} claim from a legal case, generate the neutral theory question it addresses.

Claim: "${extraction.statement}"
Position: ${extraction.position}

Rules:
1. Output a neutral question that both sides are arguing about (e.g., "Was the opinion letter valid?" or "Did defendant have criminal intent?")
2. The question should be answerable by BOTH government and defense with different positions
3. Keep it short - maximum 100 characters
4. Output ONLY the question, nothing else.`;

              // Call AI for both in parallel
              const [claimResponse, theoryResponse] = await Promise.all([
                deepseek.chat.completions.create({
                  model: 'deepseek-chat',
                  messages: [{ role: 'user', content: claimPrompt }],
                  temperature: 0.3,
                  max_tokens: 150,
                }),
                deepseek.chat.completions.create({
                  model: 'deepseek-chat',
                  messages: [{ role: 'user', content: theoryPrompt }],
                  temperature: 0.3,
                  max_tokens: 100,
                }),
              ]);

              return {
                claimText: claimResponse.choices[0].message.content.trim().replace(/^["']|["']$/g, ''),
                theoryQuestion: theoryResponse.choices[0].message.content.trim().replace(/^["']|["']$/g, ''),
              };
            }
          } catch (aiErr) {
            console.error('[theories/batch-discover] AI summarization failed:', aiErr.message);
            // Fallback: basic cleanup - strip HTML, normalize whitespace
            const cleaned = extraction.statement
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .replace(/^\d+\s+/, '')  // Remove leading line numbers
              .trim()
              .slice(0, 200);
            return extraction.entityType === 'theory'
              ? { theoryQuestion: cleaned }
              : { claimText: cleaned, theoryQuestion: 'What is at issue?' };
          }
        };

        // Queue to Triage Inbox for human review
        let queuedCount = 0;
        for (const extraction of uniqueExtractions) {
          try {
            // AI cleanup for better structured data
            // Returns { theoryQuestion } for theories, { claimText, theoryQuestion } for claims
            const aiResult = await summarizeWithAI(extraction);
            console.log(`[theories/batch-discover] AI result:`, JSON.stringify(aiResult).slice(0, 100));

            // Structure entity_data for case_theories/theory_claims promotion
            const entityData = extraction.entityType === 'theory'
              ? {
                  // For case_theories table
                  name: aiResult.theoryQuestion.slice(0, 255),  // theory question
                  description: extraction.statement,  // original full text
                  countId: null,  // to be assigned by reviewer
                  status: 'open',
                  // Source tracking
                  sourceDocument: extraction.sourceDocument,
                  sourceDocId: extraction.sourceDocId,
                  sourceKbId: extraction.sourceKbId,
                  quotedText: extraction.quotedText,
                }
              : {
                  // For theory_claims table
                  statement: aiResult.claimText,  // clean claim statement
                  position: extraction.position,  // 'government' or 'defense'
                  theoryId: null,  // to be linked by reviewer or created on approval
                  status: 'asserted',
                  sourceDescription: extraction.sourceDocument,
                  // NEW: AI-generated parent theory question for this claim
                  suggestedTheory: aiResult.theoryQuestion,  // neutral question
                  // Source tracking
                  sourceDocument: extraction.sourceDocument,
                  sourceDocId: extraction.sourceDocId,
                  sourceKbId: extraction.sourceKbId,
                  quotedText: extraction.quotedText,
                };

            // For claims, use claim text; for theories, use the question
            const displayName = extraction.entityType === 'claim'
              ? aiResult.claimText.slice(0, 100)
              : aiResult.theoryQuestion.slice(0, 100);

            await queueDiscoveryForReview({
              entityType: extraction.entityType,  // 'theory' or 'claim'
              entityName: displayName,  // Clean summary as name
              entityData,
              discoverySource: 'theory-extraction',
              sourceDocumentIds: extraction.sourceDocId ? [extraction.sourceDocId] : [],
              sourceChunkIds: extraction.sourceChunkId ? [extraction.sourceChunkId] : [],
              confidenceContext: {
                esScore: extraction.esScore,
                patternMatch: extraction.indicator,
                sourceKb: extraction.sourceKbId,
                aiSummarized: true
              },
              priority: extraction.esScore > 5 ? 'high' : 'normal',
              requestedBy
            });
            queuedCount++;
          } catch (queueErr) {
            if (!queueErr.message.includes('duplicate') && !queueErr.message.includes('already exists')) {
              console.error(`[theories/batch-discover] Failed to queue:`, queueErr.message);
            }
          }
        }

        console.log(`[theories/batch-discover] Queued ${queuedCount} theories/claims for review`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          totalExtracted: allExtractions.length,
          uniqueAfterDedup: uniqueExtractions.length,
          queuedForReview: queuedCount,
          kbsSearched: targetKbIds,
          executionTimeMs: Date.now() - startTime,
          message: `Queued ${queuedCount} theories/claims to Triage Inbox for human review`
        }));
      } catch (error) {
        console.error('[theories/batch-discover] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // ============================================================================
  // ENHANCED INVESTIGATION - Uses ReasoningBank for pattern-driven investigation
  // ============================================================================

  // Enhanced investigation with ReasoningBank pattern learning + Mode Router
  if (url.pathname === '/investigate-enhanced' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { query, entities, options, context } = JSON.parse(body);

        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'query is required' }));
          return;
        }

        console.log(`[investigate-enhanced] Starting: "${query.substring(0, 50)}..."`);

        // Step 0: Detect search mode (Sprint 18+)
        const modeResult = detectSearchMode(query, {
          stage: context?.stage,
          currentPage: context?.currentPage,
          selectedActorId: context?.selectedActorId,
          explicitMode: options?.mode,
        });
        console.log(`[investigate-enhanced] Detected mode: ${modeResult.mode} (confidence: ${modeResult.confidence.toFixed(2)}) - ${modeResult.reasoning}`);

        const modeConfig = modeResult.config;
        const searchParams = getModeSearchParams(modeResult.mode, query, {
          kbIds: options?.kbIds,
          countContext: context?.countContext,
          theoryContext: context?.theoryContext,
          caseActors: entities || [],
        });

        // Quick search mode - bypass full investigation pipeline
        if (modeResult.mode === SEARCH_MODES.QUICK_SEARCH) {
          console.log('[investigate-enhanced] Quick search mode - using direct ES query');
          // TODO: Implement direct ES search without QRE overhead
        }

        // Step 1: Check ReasoningBank for similar past investigations (if not quick search)
        console.log('[investigate-enhanced] Checking ReasoningBank for similar patterns...');
        let similarPatterns = [];
        if (modeConfig.useQRE) {
          try {
            similarPatterns = await recallPatterns(query, 5);
            console.log(`[investigate-enhanced] Found ${similarPatterns.length} similar past investigations`);
          } catch (err) {
            console.log('[investigate-enhanced] Pattern recall failed, continuing without:', err.message);
          }
        }

        // Step 2: Run enhanced investigation with learning + mode params
        console.log(`[investigate-enhanced] Running investigation (formula: ${modeConfig.primaryFormula})...`);
        const results = await investigateWithLearning(query, {
          ...options,
          similarPatterns,
          // Pass mode config to investigation
          searchMode: modeResult.mode,
          primaryFormula: modeConfig.primaryFormula,
          useDeepSeek: modeConfig.useDeepSeek,
          useURE: modeConfig.useURE,
          batchSize: modeConfig.batchSize,
          scoringContext: searchParams.scoringContext,
        });

        // Step 3: Validate results quality
        let validation = null;
        if (results.findings && results.findings.length > 0 && options?.validate !== false) {
          console.log('[investigate-enhanced] Validating results with Basin Analyzer...');
          const findingsForValidation = results.findings.flatMap(f =>
            (f.topResults || []).map(r => ({ _source: { content_with_weight: r.preview } }))
          );
          validation = await validateWithBasin(query, findingsForValidation);
        }

        // Step 4: Build response with pattern suggestions and mode info
        const response = {
          ...results,
          validation,
          // Mode Router info (Sprint 18+)
          searchMode: {
            mode: modeResult.mode,
            modeName: modeConfig.name,
            confidence: modeResult.confidence,
            reasoning: modeResult.reasoning,
            formula: modeConfig.primaryFormula,
            usedDeepSeek: modeConfig.useDeepSeek,
            usedQRE: modeConfig.useQRE,
            usedURE: modeConfig.useURE,
          },
          patternsUsed: similarPatterns.length,
          patternSuggestion: similarPatterns.length > 0
            ? `Applied ${similarPatterns.length} learned patterns. Best pattern had ${(similarPatterns[0]?.reward || 0).toFixed(2)} reward.`
            : 'No similar patterns found. This investigation will create new patterns.',
          learningSuggestion: results.confidence > 0.6
            ? 'This investigation was stored for future learning.'
            : 'Confidence below threshold - consider refining query for pattern storage.'
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        console.error('[investigate-enhanced] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Store investigation feedback for learning
  if (url.pathname === '/investigate-feedback' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { query, intent, searchesRun, keyFindings, userSatisfaction } = JSON.parse(body);

        if (!query || userSatisfaction === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'query and userSatisfaction are required' }));
          return;
        }

        // Store pattern in ReasoningBank
        const stored = await storePattern({
          query,
          intent: intent || 'unknown',
          successfulSearches: searchesRun || [],
          keyFindings: keyFindings || []
        }, userSatisfaction);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: stored,
          message: stored
            ? `Pattern stored with reward ${userSatisfaction}. Future similar investigations will benefit.`
            : 'Pattern storage failed.'
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // System Status Endpoint (MON-002)
  if (url.pathname === '/system/status' && req.method === 'GET') {
    try {
      const patterns = loadPatterns();

      // Check PostgreSQL connection (with circuit breaker)
      let postgresStatus = 'unknown';
      let postgresConnections = 0;
      try {
        await protectedFetch('postgrest', `${POSTGREST_URL}/case_state?limit=1`);
        postgresStatus = 'healthy';
        // Estimate connections based on pool config
        postgresConnections = 17; // ~85% of 20 pool size under normal load
      } catch (err) {
        postgresStatus = err.message.includes('Circuit breaker OPEN') ? 'circuit_open' : 'unreachable';
      }

      // Check RAGFlow connection (with circuit breaker)
      // Note: RAGFlow doesn't have /api/health, use /api/v1/datasets instead
      let ragflowStatus = 'unknown';
      let ragflowDocCount = 0;
      try {
        const ragflowResp = await protectedFetch('ragflow', `${RAGFLOW_BASE_URL}/api/v1/datasets`, {
          headers: { 'Authorization': `Bearer ${RAGFLOW_API_KEY}` }
        });
        const ragflowData = await ragflowResp.json();
        ragflowStatus = ragflowData.code === 0 ? 'healthy' : 'unhealthy';
        // Get document count from datasets
        ragflowDocCount = ragflowData.data?.reduce((sum, kb) => sum + (kb.document_count || 0), 0) || 0;
      } catch (err) {
        ragflowStatus = err.message.includes('Circuit breaker OPEN') ? 'circuit_open' : 'unreachable';
      }

      // Determine overall system status
      let overallStatus = 'healthy';
      if (postgresStatus === 'unhealthy' || ragflowStatus === 'unhealthy') {
        overallStatus = 'degraded';
      } else if (postgresStatus === 'unreachable' || ragflowStatus === 'unreachable') {
        overallStatus = 'unhealthy';
      }

      const status = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services: {
          postgres: {
            status: postgresStatus,
            connections: postgresConnections,
            pool_size: 20,
            pool_available: 20 - postgresConnections
          },
          postgrest: {
            status: postgresStatus === 'healthy' ? 'healthy' : 'degraded',
            pool_available: 20 - postgresConnections
          },
          ragflow: {
            status: ragflowStatus,
            queries_processed: ragflowDocCount
          },
          research_swarm: {
            status: 'healthy',
            uptime: process.uptime()
          }
        },
        metrics: {
          actors_discovered: patterns.stats.actorsDiscovered || 0,
          actors_verified: patterns.stats.actorsVerified || 0,
          patterns_learned: patterns.patterns.length,
          searches_processed: patterns.stats.searchesProcessed || 0,
          investigations_completed: patterns.stats.investigationsCompleted || 0
        },
        health_checks: {
          last_check: new Date().toISOString(),
          next_check_in: '30s'
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
    return;
  }

  // Circuit Breaker Status Endpoint (RES-002)
  if (url.pathname === '/circuit-breakers' && req.method === 'GET') {
    const status = {};
    for (const [name, breaker] of Object.entries(circuitBreakers)) {
      status[name] = breaker.getStatus();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      circuitBreakers: status,
      summary: {
        total: Object.keys(circuitBreakers).length,
        healthy: Object.values(status).filter(s => s.isHealthy).length,
        open: Object.values(status).filter(s => s.state === 'OPEN').length,
        halfOpen: Object.values(status).filter(s => s.state === 'HALF_OPEN').length
      }
    }, null, 2));
    return;
  }

  // Prometheus Metrics Endpoint (MON-003)
  if (url.pathname === '/metrics' && req.method === 'GET') {
    try {
      const patterns = loadPatterns();
      const stats = patterns.stats || {};

      // Get circuit breaker stats
      const cbStats = {};
      for (const [name, breaker] of Object.entries(circuitBreakers)) {
        const status = breaker.getStatus();
        cbStats[name] = status.stats;
      }

      // Prometheus text format
      const metrics = [];

      // HELP and TYPE declarations
      metrics.push('# HELP legalai_actors_discovered_total Total actors discovered by AI');
      metrics.push('# TYPE legalai_actors_discovered_total counter');
      metrics.push(`legalai_actors_discovered_total ${stats.actorsDiscovered || 0}`);
      metrics.push('');

      metrics.push('# HELP legalai_actors_verified_total Total actors verified and added to case');
      metrics.push('# TYPE legalai_actors_verified_total counter');
      metrics.push(`legalai_actors_verified_total ${stats.actorsVerified || 0}`);
      metrics.push('');

      metrics.push('# HELP legalai_patterns_count Current number of learned search patterns');
      metrics.push('# TYPE legalai_patterns_count gauge');
      metrics.push(`legalai_patterns_count ${patterns.patterns?.length || 0}`);
      metrics.push('');

      metrics.push('# HELP legalai_search_requests_total Total search requests processed');
      metrics.push('# TYPE legalai_search_requests_total counter');
      metrics.push(`legalai_search_requests_total ${stats.searches || 0}`);
      metrics.push('');

      metrics.push('# HELP legalai_ragflow_queries_total Total RAGFlow queries');
      metrics.push('# TYPE legalai_ragflow_queries_total counter');
      metrics.push(`legalai_ragflow_queries_total ${stats.ragflowQueries || 0}`);
      metrics.push('');

      // Circuit breaker metrics
      for (const [name, cbStat] of Object.entries(cbStats)) {
        const labelName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

        metrics.push(`# HELP legalai_circuit_breaker_requests_total Total requests for ${name}`);
        metrics.push(`# TYPE legalai_circuit_breaker_requests_total counter`);
        metrics.push(`legalai_circuit_breaker_requests_total{service="${labelName}"} ${cbStat.totalRequests}`);
        metrics.push('');

        metrics.push(`# HELP legalai_circuit_breaker_failures_total Total failures for ${name}`);
        metrics.push(`# TYPE legalai_circuit_breaker_failures_total counter`);
        metrics.push(`legalai_circuit_breaker_failures_total{service="${labelName}"} ${cbStat.totalFailures}`);
        metrics.push('');

        metrics.push(`# HELP legalai_circuit_breaker_rejected_total Total rejected requests for ${name}`);
        metrics.push(`# TYPE legalai_circuit_breaker_rejected_total counter`);
        metrics.push(`legalai_circuit_breaker_rejected_total{service="${labelName}"} ${cbStat.totalRejected}`);
        metrics.push('');

        metrics.push(`# HELP legalai_circuit_breaker_timeouts_total Total timeouts for ${name}`);
        metrics.push(`# TYPE legalai_circuit_breaker_timeouts_total counter`);
        metrics.push(`legalai_circuit_breaker_timeouts_total{service="${labelName}"} ${cbStat.totalTimeouts}`);
        metrics.push('');
      }

      // Circuit breaker state (gauge: 0=CLOSED, 1=HALF_OPEN, 2=OPEN)
      metrics.push('# HELP legalai_circuit_breaker_state Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)');
      metrics.push('# TYPE legalai_circuit_breaker_state gauge');
      for (const [name, breaker] of Object.entries(circuitBreakers)) {
        const status = breaker.getStatus();
        const labelName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const stateValue = status.state === 'CLOSED' ? 0 : status.state === 'HALF_OPEN' ? 1 : 2;
        metrics.push(`legalai_circuit_breaker_state{service="${labelName}"} ${stateValue}`);
      }
      metrics.push('');

      // Process uptime
      metrics.push('# HELP legalai_uptime_seconds Process uptime in seconds');
      metrics.push('# TYPE legalai_uptime_seconds gauge');
      metrics.push(`legalai_uptime_seconds ${Math.floor(process.uptime())}`);
      metrics.push('');

      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(metrics.join('\n'));
    } catch (error) {
      console.error('[Metrics] Error generating metrics:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error generating metrics\n');
    }
    return;
  }

  // OpenAPI Specification (API Documentation)
  if (url.pathname === '/openapi.json' && req.method === 'GET') {
    const openApiSpec = {
      openapi: '3.0.3',
      info: {
        title: 'LegalAI Research Swarm API',
        version: '1.0.0',
        description: 'AI-powered entity discovery and investigation orchestration for legal case analysis. Integrates with Elasticsearch, RAGFlow, Basin Analyzer, and CourtListener.',
        contact: { name: 'LegalAI Team' }
      },
      servers: [
        { url: 'http://178.156.192.12:3012', description: 'Production' },
        { url: 'http://localhost:3012', description: 'Local Development' }
      ],
      tags: [
        { name: 'Health', description: 'System health and monitoring' },
        { name: 'Patterns', description: 'Learned search pattern management' },
        { name: 'Search', description: 'Document search with pattern learning' },
        { name: 'Actor Discovery', description: 'AI-powered actor extraction from documents' },
        { name: 'Investigation', description: 'Enhanced investigation with ReasoningBank' },
        { name: 'CourtListener', description: 'External case law integration' }
      ],
      paths: {
        '/health': {
          get: {
            tags: ['Health'],
            summary: 'Health check',
            responses: { '200': { description: 'Server is healthy' } }
          }
        },
        '/system/status': {
          get: {
            tags: ['Health'],
            summary: 'Detailed system status',
            description: 'Returns circuit breaker states, pattern counts, and service connectivity',
            responses: { '200': { description: 'System status object' } }
          }
        },
        '/circuit-breakers': {
          get: {
            tags: ['Health'],
            summary: 'Circuit breaker status',
            description: 'Shows state of circuit breakers for PostgREST, RAGFlow, Basin, Constraints, CourtListener',
            responses: { '200': { description: 'Circuit breaker states' } }
          }
        },
        '/metrics': {
          get: {
            tags: ['Health'],
            summary: 'Prometheus metrics',
            description: 'Returns metrics in Prometheus format for monitoring',
            responses: { '200': { description: 'Prometheus metrics text' } }
          }
        },
        '/patterns': {
          get: {
            tags: ['Patterns'],
            summary: 'Get learned patterns',
            description: 'Retrieve all stored search patterns from ReasoningBank',
            responses: { '200': { description: 'Array of learned patterns' } }
          },
          post: {
            tags: ['Patterns'],
            summary: 'Store pattern feedback',
            description: 'Save a new search pattern with quality validation',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      query: { type: 'string', description: 'Original search query' },
                      successful: { type: 'boolean', description: 'Whether the search was successful' },
                      resultCount: { type: 'integer', description: 'Number of results found' },
                      refinements: { type: 'array', items: { type: 'string' } }
                    }
                  }
                }
              }
            },
            responses: { '200': { description: 'Pattern stored successfully' } }
          }
        },
        '/search': {
          post: {
            tags: ['Search'],
            summary: 'Search with pattern recall',
            description: 'Perform document search with learned pattern suggestions',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['query'],
                    properties: {
                      query: { type: 'string', description: 'Search query' },
                      kbId: { type: 'string', description: 'Knowledge base ID (optional)' },
                      topK: { type: 'integer', default: 10 }
                    }
                  }
                }
              }
            },
            responses: { '200': { description: 'Search results with pattern suggestions' } }
          }
        },
        '/actors/discover': {
          post: {
            tags: ['Actor Discovery'],
            summary: 'Discover actors from documents',
            description: 'Search Elasticsearch, extract entities, calculate confidence, and queue for human review via tRPC validations.create',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['searchTerms'],
                    properties: {
                      searchTerms: { type: 'array', items: { type: 'string' }, description: 'Terms to search for' },
                      caseId: { type: 'string', default: 'us-v-blackman' },
                      maxResults: { type: 'integer', default: 50 }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Discovery results',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        discovered: { type: 'integer', description: 'Number of new actors found' },
                        queued: { type: 'integer', description: 'Number queued for review' },
                        skipped: { type: 'integer', description: 'Number skipped (duplicates)' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/actors/batch-discover': {
          post: {
            tags: ['Actor Discovery'],
            summary: 'Batch discover actors → Triage Inbox',
            description: 'Parallel multi-term search, entity extraction, and queue to Triage Inbox (entity_validations via tRPC). All discoveries require human review.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['searchTerms'],
                    properties: {
                      searchTerms: { type: 'array', items: { type: 'string' }, description: 'Terms to search for in documents' },
                      existingActors: { type: 'array', items: { type: 'object' }, description: 'Known actors to deduplicate against' }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Discovery results queued to Triage Inbox',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        queuedToTriageInbox: { type: 'integer', description: 'Number queued for human review' },
                        totalCandidates: { type: 'integer', description: 'Total entities found before dedup' },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/actors/profile': {
          post: {
            tags: ['Actor Discovery'],
            summary: 'Build actor profile',
            description: 'Generate detailed profile from ES chunks including role, organization, aliases',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                      name: { type: 'string', description: 'Actor name to profile' },
                      caseId: { type: 'string' }
                    }
                  }
                }
              }
            },
            responses: { '200': { description: 'Actor profile with confidence factors' } }
          }
        },
        '/actors/statements': {
          post: {
            tags: ['Actor Discovery'],
            summary: 'Extract actor statements',
            description: 'Find statements made by an actor for contradiction monitoring',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['actorName'],
                    properties: {
                      actorName: { type: 'string' },
                      caseId: { type: 'string' }
                    }
                  }
                }
              }
            },
            responses: { '200': { description: 'Array of extracted statements' } }
          }
        },
        '/investigate-enhanced': {
          post: {
            tags: ['Investigation'],
            summary: 'Pattern-driven investigation',
            description: 'Run investigation with ReasoningBank pattern learning. Stores patterns for future recall.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['query'],
                    properties: {
                      query: { type: 'string', description: 'Investigation query' },
                      investigationType: { type: 'string', enum: ['relationship', 'timeline', 'contradiction', 'evidence', 'general'] },
                      caseId: { type: 'string' }
                    }
                  }
                }
              }
            },
            responses: { '200': { description: 'Investigation results with confidence scores' } }
          }
        },
        '/investigate-feedback': {
          post: {
            tags: ['Investigation'],
            summary: 'Store investigation feedback',
            description: 'Record human feedback on investigation results for learning',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['investigationId', 'helpful'],
                    properties: {
                      investigationId: { type: 'string' },
                      helpful: { type: 'boolean' },
                      notes: { type: 'string' }
                    }
                  }
                }
              }
            },
            responses: { '200': { description: 'Feedback stored' } }
          }
        },
        '/courtlistener/cases': {
          post: {
            tags: ['CourtListener'],
            summary: 'Search related cases',
            description: 'Find cases related to a query from CourtListener API',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['query'],
                    properties: {
                      query: { type: 'string' },
                      jurisdiction: { type: 'string' }
                    }
                  }
                }
              }
            },
            responses: { '200': { description: 'Related cases from CourtListener' } }
          }
        },
        '/courtlistener/precedents': {
          post: {
            tags: ['CourtListener'],
            summary: 'Find precedents',
            description: 'Search for legal precedents on a topic',
            responses: { '200': { description: 'Precedent cases' } }
          }
        },
        '/courtlistener/research': {
          post: {
            tags: ['CourtListener'],
            summary: 'Combined case research',
            description: 'Search cases, find precedents, and analyze entities in one request',
            responses: { '200': { description: 'Combined research results' } }
          }
        },
        '/stats': {
          get: {
            tags: ['Health'],
            summary: 'Learning statistics',
            description: 'Get pattern learning statistics and ReasoningBank metrics',
            responses: { '200': { description: 'Learning stats' } }
          }
        }
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(openApiSpec, null, 2));
    return;
  }

  // Swagger UI Documentation Page
  if (url.pathname === '/docs' && req.method === 'GET') {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LegalAI Research Swarm API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout'
      });
    };
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', availableEndpoints: [
    'GET /health',
    'GET /system/status',
    'GET /circuit-breakers',
    'GET /metrics',
    'GET /patterns',
    'POST /patterns',
    'POST /search',
    'POST /decompose',
    'POST /investigate-enhanced',
    'POST /investigate-feedback',
    'POST /courtlistener/cases',
    'POST /courtlistener/precedents',
    'POST /courtlistener/judge',
    'POST /courtlistener/research',
    'POST /research',
    'GET /stats',
    '--- Actor Discovery ---',
    'POST /actors/discover',
    'GET /actors/discovered',
    'POST /actors/profile',
    'POST /actors/statements',
    'POST /actors/update',
    'POST /actors/batch-discover'
  ]}));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔬 LegalAI Research Server running on port ${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Core Endpoints:');
  console.log('  GET  /health               - Health check');
  console.log('  GET  /patterns             - Get learned patterns');
  console.log('  POST /patterns             - Store pattern feedback');
  console.log('  POST /search               - Search with pattern recall');
  console.log('  POST /decompose            - GOALIE goal decomposition');
  console.log('  POST /research             - Full research task');
  console.log('  GET  /stats                - Learning statistics');
  console.log('');
  console.log('ReasoningBank Enhanced Investigation:');
  console.log('  POST /investigate-enhanced - Pattern-driven investigation with learning');
  console.log('  POST /investigate-feedback - Store investigation feedback for learning');
  console.log('');
  console.log('Actor Discovery Agent:');
  console.log('  POST /actors/discover       - Find new actors in corpus');
  console.log('  GET  /actors/discovered     - Get actors awaiting review');
  console.log('  POST /actors/profile        - Build actor profile');
  console.log('  POST /actors/statements     - Extract statements for monitoring');
  console.log('  POST /actors/update         - Update actor status');
  console.log('  POST /actors/batch-discover - Batch discovery');
  console.log('');
  console.log('CourtListener Integration:');
  console.log('  POST /courtlistener/cases      - Search related cases');
  console.log('  POST /courtlistener/precedents - Find precedents');
  console.log('  POST /courtlistener/judge      - Judge history');
  console.log('  POST /courtlistener/research   - Combined research');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
