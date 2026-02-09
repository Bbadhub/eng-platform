/**
 * Search Mode Router
 *
 * Smart routing for different investigation goals.
 * Selects appropriate formulas, tools, and processing modes.
 *
 * MODES:
 *   1. trial_analysis   - Deep dive into trial transcripts
 *   2. entity_linking   - Person ↔ Org relationships
 *   3. exhibit_linking  - GX/DX → Actor connections
 *   4. bulk_linking     - Mass document → entity linking
 *   5. deep_dive        - Investigate specific theory/question
 *   6. quick_search     - Fast keyword/boolean search
 */

// ===========================================
// Mode Definitions
// ===========================================

const SEARCH_MODES = {
  TRIAL_ANALYSIS: 'trial_analysis',
  ENTITY_LINKING: 'entity_linking',
  EXHIBIT_LINKING: 'exhibit_linking',
  BULK_LINKING: 'bulk_linking',
  DEEP_DIVE: 'deep_dive',
  QUICK_SEARCH: 'quick_search',
};

const MODE_CONFIG = {
  [SEARCH_MODES.TRIAL_ANALYSIS]: {
    name: 'Trial Analysis',
    description: 'Deep dive into trial transcripts to extract actors, orgs, counts, theories',
    primaryFormula: 'formula_d',  // DeepSeek Legal
    secondaryFormula: 'formula_c', // Entity Tags
    useQRE: true,
    useURE: true,
    useDeepSeek: true,
    batchSize: 1,  // Process one at a time (thorough)
    defaultKbs: ['5ee7e6d4e77111f0ad560242ac130008'],  // First Trial KB
  },
  [SEARCH_MODES.ENTITY_LINKING]: {
    name: 'Person ↔ Org Linking',
    description: 'Build entity relationships using co-occurrence and graph signals',
    primaryFormula: 'formula_b',  // Graph/Context
    secondaryFormula: 'formula_c', // Entity Tags
    useQRE: false,
    useURE: false,
    useDeepSeek: false,
    batchSize: 10,
    defaultKbs: null,  // All KBs
  },
  [SEARCH_MODES.EXHIBIT_LINKING]: {
    name: 'Exhibit Linking',
    description: 'Connect Government/Defense exhibits to actors',
    primaryFormula: 'formula_c',  // Entity Tags
    secondaryFormula: 'formula_a', // Baseline
    useQRE: false,
    useURE: false,
    useDeepSeek: false,
    batchSize: 20,
    defaultKbs: ['84988933e77111f09c230242ac130008'],  // Government Exhibits
  },
  [SEARCH_MODES.BULK_LINKING]: {
    name: 'Bulk Document Linking',
    description: 'Mass link documents to known entities with context scoring',
    primaryFormula: 'formula_a',  // Baseline (fast)
    secondaryFormula: 'formula_c', // Entity Tags
    useQRE: false,
    useURE: false,
    useDeepSeek: false,
    batchSize: 50,
    defaultKbs: null,  // All KBs
  },
  [SEARCH_MODES.DEEP_DIVE]: {
    name: 'Deep Dive Investigation',
    description: 'Thorough investigation of specific theory, contradiction, or Brady material',
    primaryFormula: 'formula_d',  // Combined (all signals)
    secondaryFormula: null,
    useQRE: true,
    useURE: true,
    useDeepSeek: true,
    batchSize: 1,
    defaultKbs: null,  // Search all KBs
  },
  [SEARCH_MODES.QUICK_SEARCH]: {
    name: 'Quick Search',
    description: 'Fast keyword/boolean search without reasoning overhead',
    primaryFormula: 'formula_a',  // Baseline
    secondaryFormula: null,
    useQRE: false,
    useURE: false,
    useDeepSeek: false,
    batchSize: 100,
    defaultKbs: null,
  },
};

// ===========================================
// Query Pattern Detection
// ===========================================

const QUICK_SEARCH_PATTERNS = [
  /^find\b/i,
  /^show\s+(me\s+)?(all\s+)?/i,
  /^list\s+(all\s+)?/i,
  /^search\s+(for\s+)?/i,
  /^get\s+(all\s+)?/i,
  /^what\s+(are|is)\s+the\s+/i,
  /emails?\s+(from|to|with|about)/i,
  /documents?\s+(from|about|containing)/i,
  /recordings?\s+(from|with|of)/i,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i,
  /\b20\d{2}\b/,  // Year patterns
  /\bGX[-\s]?\d+/i,  // Government exhibit
  /\bDX[-\s]?\d+/i,  // Defense exhibit
];

const DEEP_DIVE_PATTERNS = [
  /^investigate\b/i,
  /^analyze\b/i,
  /^explain\s+(why|how)/i,
  /^why\s+(did|does|is|was|were)/i,
  /^how\s+(did|does|could|can)/i,
  /contradiction/i,
  /inconsisten/i,
  /brady\s+material/i,
  /exculpatory/i,
  /impeach/i,
  /prove\s+that/i,
  /evidence\s+(that|of|for)/i,
  /what\s+(evidence|proof)/i,
  /support\s+(the\s+)?(claim|theory|defense)/i,
  /undermine/i,
  /credibility/i,
];

const TRIAL_ANALYSIS_PATTERNS = [
  /trial\s+transcript/i,
  /testimony\s+of/i,
  /what\s+did\s+\w+\s+testify/i,
  /cross[-\s]?examination/i,
  /direct\s+examination/i,
  /opening\s+statement/i,
  /closing\s+argument/i,
  /jury\s+instruction/i,
  /witness\s+list/i,
];

const EXHIBIT_LINKING_PATTERNS = [
  /link\s+(exhibit|GX|DX)/i,
  /exhibit\s+\d+/i,
  /GX[-\s]?\d+.*to.*actor/i,
  /connect.*exhibit/i,
  /government\s+exhibit/i,
  /defense\s+exhibit/i,
];

const ENTITY_LINKING_PATTERNS = [
  /who\s+(works|worked)\s+(for|at|with)/i,
  /relationship\s+between/i,
  /connected\s+to/i,
  /associated\s+with/i,
  /link\s+\w+\s+to\s+\w+/i,
  /org(anization)?s?\s+(for|of)/i,
  /employer/i,
  /employee/i,
];

// ===========================================
// Mode Detection
// ===========================================

/**
 * Detect the appropriate search mode for a query
 *
 * @param {string} query - User's search query
 * @param {Object} context - Current workflow context
 * @param {string} context.stage - Current workflow stage (trial_analysis, entity_linking, etc.)
 * @param {string} context.currentPage - UI page user is on
 * @param {string} context.selectedActorId - If an actor is selected
 * @param {string} context.selectedDocumentId - If a document is selected
 * @returns {Object} { mode, config, confidence, reasoning }
 */
function detectSearchMode(query, context = {}) {
  const normalizedQuery = query.trim().toLowerCase();

  // 1. Check for explicit mode hints
  if (context.explicitMode && MODE_CONFIG[context.explicitMode]) {
    return {
      mode: context.explicitMode,
      config: MODE_CONFIG[context.explicitMode],
      confidence: 1.0,
      reasoning: 'Explicit mode specified by user/system',
    };
  }

  // 2. Pattern matching (in priority order)

  // Trial analysis patterns
  if (matchesPatterns(query, TRIAL_ANALYSIS_PATTERNS)) {
    return {
      mode: SEARCH_MODES.TRIAL_ANALYSIS,
      config: MODE_CONFIG[SEARCH_MODES.TRIAL_ANALYSIS],
      confidence: 0.9,
      reasoning: 'Query contains trial/testimony patterns',
    };
  }

  // Deep dive patterns (before quick search - more specific)
  if (matchesPatterns(query, DEEP_DIVE_PATTERNS)) {
    return {
      mode: SEARCH_MODES.DEEP_DIVE,
      config: MODE_CONFIG[SEARCH_MODES.DEEP_DIVE],
      confidence: 0.85,
      reasoning: 'Query requires investigation/analysis',
    };
  }

  // Exhibit linking patterns
  if (matchesPatterns(query, EXHIBIT_LINKING_PATTERNS)) {
    return {
      mode: SEARCH_MODES.EXHIBIT_LINKING,
      config: MODE_CONFIG[SEARCH_MODES.EXHIBIT_LINKING],
      confidence: 0.85,
      reasoning: 'Query involves exhibit linking',
    };
  }

  // Entity linking patterns
  if (matchesPatterns(query, ENTITY_LINKING_PATTERNS)) {
    return {
      mode: SEARCH_MODES.ENTITY_LINKING,
      config: MODE_CONFIG[SEARCH_MODES.ENTITY_LINKING],
      confidence: 0.8,
      reasoning: 'Query involves entity relationships',
    };
  }

  // Quick search patterns (most common case)
  if (matchesPatterns(query, QUICK_SEARCH_PATTERNS)) {
    return {
      mode: SEARCH_MODES.QUICK_SEARCH,
      config: MODE_CONFIG[SEARCH_MODES.QUICK_SEARCH],
      confidence: 0.9,
      reasoning: 'Query is a simple search/retrieval',
    };
  }

  // 3. Context-based fallback
  if (context.stage) {
    const stageMode = {
      'trial_analysis': SEARCH_MODES.TRIAL_ANALYSIS,
      'entity_linking': SEARCH_MODES.ENTITY_LINKING,
      'exhibit_linking': SEARCH_MODES.EXHIBIT_LINKING,
      'bulk_linking': SEARCH_MODES.BULK_LINKING,
    }[context.stage];

    if (stageMode) {
      return {
        mode: stageMode,
        config: MODE_CONFIG[stageMode],
        confidence: 0.6,
        reasoning: `Based on current workflow stage: ${context.stage}`,
      };
    }
  }

  // 4. Default to quick search
  return {
    mode: SEARCH_MODES.QUICK_SEARCH,
    config: MODE_CONFIG[SEARCH_MODES.QUICK_SEARCH],
    confidence: 0.5,
    reasoning: 'Default mode - no specific patterns matched',
  };
}

/**
 * Check if query matches any of the given patterns
 */
function matchesPatterns(query, patterns) {
  return patterns.some(pattern => pattern.test(query));
}

// ===========================================
// Mode Handlers
// ===========================================

/**
 * Get search parameters for a mode
 * Returns ES query params, formula selection, and processing options
 */
function getModeSearchParams(mode, query, context = {}) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG[SEARCH_MODES.QUICK_SEARCH];

  return {
    // ES search parameters
    esParams: {
      query,
      kbIds: config.defaultKbs || context.kbIds || null,
      limit: config.batchSize,
      useSemanticSearch: mode !== SEARCH_MODES.QUICK_SEARCH,
      highlightMatches: true,
    },

    // Formula selection
    formula: {
      primary: config.primaryFormula,
      secondary: config.secondaryFormula,
    },

    // Processing flags
    processing: {
      useQRE: config.useQRE,
      useURE: config.useURE,
      useDeepSeek: config.useDeepSeek,
      batchSize: config.batchSize,
    },

    // Scoring context (passed to formula engine)
    scoringContext: {
      countContext: context.countContext || '',
      theoryContext: context.theoryContext || '',
      caseActors: context.caseActors || [],
      documentType: context.documentType || 'other',
    },
  };
}

/**
 * Execute mode-specific post-processing
 * Called after ES search returns results
 */
async function postProcessResults(mode, results, context = {}) {
  const config = MODE_CONFIG[mode];

  // Quick search - minimal processing
  if (mode === SEARCH_MODES.QUICK_SEARCH) {
    return {
      results,
      mode,
      processed: false,
      message: 'Quick search - no post-processing',
    };
  }

  // Deep dive - enrich with URE validation
  if (mode === SEARCH_MODES.DEEP_DIVE && config.useURE) {
    return {
      results,
      mode,
      processed: true,
      shouldValidateWithURE: true,
      message: 'Deep dive - URE validation recommended',
    };
  }

  // Trial analysis - extract entities
  if (mode === SEARCH_MODES.TRIAL_ANALYSIS) {
    return {
      results,
      mode,
      processed: true,
      shouldExtractEntities: true,
      shouldClassifyDefense: true,
      message: 'Trial analysis - entity extraction recommended',
    };
  }

  // Bulk/Entity/Exhibit linking - score with formula
  return {
    results,
    mode,
    processed: true,
    shouldScoreWithFormula: true,
    formula: config.primaryFormula,
    message: `${config.name} - formula scoring recommended`,
  };
}

// ===========================================
// Prompt Enhancement
// ===========================================

/**
 * Enhance a DeepSeek prompt based on mode
 */
function enhancePromptForMode(mode, basePrompt, context = {}) {
  const modePrompts = {
    [SEARCH_MODES.TRIAL_ANALYSIS]: `You are analyzing trial transcript testimony. Focus on:
- Extracting key actors (witnesses, defendants, attorneys)
- Identifying counts and charges discussed
- Noting theories and claims made by each party
- Flagging contradictions or inconsistencies

${basePrompt}`,

    [SEARCH_MODES.DEEP_DIVE]: `You are conducting a deep legal investigation. Focus on:
- Finding Brady material (exculpatory evidence)
- Identifying contradictions that benefit the defense
- Evaluating witness credibility
- Supporting or undermining specific theories

${context.theoryContext ? `THEORY CONTEXT: ${context.theoryContext}` : ''}
${context.countContext ? `COUNT CONTEXT: ${context.countContext}` : ''}

${basePrompt}`,

    [SEARCH_MODES.ENTITY_LINKING]: `You are building entity relationships. Focus on:
- Who works for which organization
- Who knows or interacts with whom
- Employment history and role changes
- Organizational hierarchies

${basePrompt}`,

    [SEARCH_MODES.EXHIBIT_LINKING]: `You are linking exhibits to actors. Focus on:
- Which actors are mentioned in the exhibit
- What role the actor plays (author, recipient, subject)
- The relevance to defense strategy

${basePrompt}`,
  };

  return modePrompts[mode] || basePrompt;
}

// ===========================================
// Exports
// ===========================================

module.exports = {
  // Constants
  SEARCH_MODES,
  MODE_CONFIG,

  // Main API
  detectSearchMode,
  getModeSearchParams,
  postProcessResults,
  enhancePromptForMode,

  // Utilities
  matchesPatterns,

  // Pattern constants (for testing)
  PATTERNS: {
    QUICK_SEARCH: QUICK_SEARCH_PATTERNS,
    DEEP_DIVE: DEEP_DIVE_PATTERNS,
    TRIAL_ANALYSIS: TRIAL_ANALYSIS_PATTERNS,
    EXHIBIT_LINKING: EXHIBIT_LINKING_PATTERNS,
    ENTITY_LINKING: ENTITY_LINKING_PATTERNS,
  },
};
