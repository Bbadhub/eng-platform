/**
 * Formula Engine - Context-Aware Scoring for Defense Value
 *
 * Port of legalai-browser/src/services/formulaEngine.ts to Node.js
 * for Research Swarm integration.
 *
 * Formulas:
 *   A: Baseline     - ES keyword + semantic + tag scores
 *   B: Context      - Position detection, action verbs, signature filtering
 *   C: Defense      - Legal category classification (Brady, Impeachment, etc.)
 *   D: Combined     - Weighted blend of A + B + C
 */

// ===========================================
// Defense Categories (matches entity_validations schema)
// ===========================================

const DEFENSE_CATEGORIES = {
  EXCULPATORY: 'exculpatory',     // Supports innocence
  BRADY: 'brady',                 // Prosecution must disclose
  IMPEACHMENT: 'impeachment',     // Undermines prosecution witness
  CONTRADICTION: 'contradiction', // Conflicts with govt narrative
  CORROBORATION: 'corroboration', // Supports defense theory
  CONTEXT: 'context',             // Background information
  ADMINISTRATIVE: 'administrative', // Signatures, contact info
  DISMISSED: 'dismissed',         // Not relevant
};

// ===========================================
// Context Signal Detection
// ===========================================

const ACTION_VERBS = [
  'testified', 'stated', 'admitted', 'approved', 'denied', 'authorized',
  'directed', 'instructed', 'confirmed', 'acknowledged', 'agreed',
  'refused', 'violated', 'knew', 'understood', 'intended', 'planned',
  'executed', 'signed', 'reviewed', 'submitted', 'disclosed', 'concealed',
];

const LEGAL_TERMS = [
  'pursuant to', 'in violation', 'breach of', 'contrary to', 'under oath',
  'fraud', 'misrepresentation', 'conspiracy', 'obstruction', 'perjury',
  'medicare', 'billing', 'kickback', 'anti-kickback', 'stark law',
  'false claims', 'qui tam', 'relator', 'whistleblower',
];

const SIGNATURE_PATTERNS = [
  /\bCEO\b/, /\bCFO\b/, /\bCOO\b/, /Chief\s+\w+\s+Officer/i,
  /Cell[:.]?\s*\d/, /Phone[:.]?\s*\d/, /Fax[:.]?\s*\d/,
  /Confidential/i, /privileged/i, /attorney.client/i,
  /\bSent from\b/i, /\bGet Outlook\b/i,
  /@\w+\.\w+/, // Email in signature
  /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/, // Phone number
];

/**
 * Detect chunk position in document
 */
function detectChunkPosition(content) {
  if (!content) return 'unknown';

  const lowerContent = content.toLowerCase();
  const lines = content.split('\n');

  // Check for signature patterns
  const hasSignaturePattern = SIGNATURE_PATTERNS.some(p => p.test(content));
  if (hasSignaturePattern && lines.length < 10) {
    return 'signature';
  }

  // Check for header patterns (dates, subject lines)
  if (/^(from|to|subject|date|re:|fw:)/i.test(content.trim())) {
    return 'header';
  }

  // Check for footer patterns
  if (lowerContent.includes('disclaimer') || lowerContent.includes('confidentiality notice')) {
    return 'footer';
  }

  return 'body';
}

/**
 * Count action verbs near actor mentions
 */
function countActionVerbs(content, actorName) {
  if (!content || !actorName) return 0;

  const lowerContent = content.toLowerCase();
  const actorLower = actorName.toLowerCase();

  // Find sentences containing the actor
  const sentences = content.split(/[.!?]+/);
  let verbCount = 0;

  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(actorLower)) {
      for (const verb of ACTION_VERBS) {
        if (sentence.toLowerCase().includes(verb)) {
          verbCount++;
        }
      }
    }
  }

  return verbCount;
}

/**
 * Count legal terms in content
 */
function countLegalTerms(content) {
  if (!content) return 0;
  const lowerContent = content.toLowerCase();
  return LEGAL_TERMS.filter(term => lowerContent.includes(term)).length;
}

/**
 * Check for signature patterns
 */
function hasSignaturePatterns(content) {
  if (!content) return false;
  return SIGNATURE_PATTERNS.some(p => p.test(content));
}

/**
 * Count co-occurring actors in content
 */
function countCoOccurringActors(content, caseActors, currentActor) {
  if (!content || !caseActors || !currentActor) return [];

  const lowerContent = content.toLowerCase();
  const currentLower = currentActor.toLowerCase();

  return caseActors.filter(actor => {
    const actorLower = actor.toLowerCase();
    return actorLower !== currentLower && lowerContent.includes(actorLower);
  });
}

// ===========================================
// Default Scoring Config
// ===========================================

const DEFAULT_CONFIG = {
  MAX_BASELINE: 100,
  MAX_SEMANTIC: 40,
  MAX_KEYWORD: 30,
  MAX_TAG: 30,
  MAX_ACTOR: 20,
  MAX_DATE: 10,
  MAX_LEARNED: 20,
  MAX_ACTIVITY: 10,
  MIN_CONFIDENCE: 30,  // Threshold for suggesting
  POINTS_PER_KEYWORD: 10,
  POINTS_PER_ACTOR: 15,
  TAG_WEIGHTS: {
    Brady: 50,
    Exculpatory: 50,
    Impeachment: 40,
    Giglio: 40,
    Inconsistency: 35,
    'Evidence Conflict': 35,
    'Witness Inconsistency': 35,
  },
};

// ===========================================
// Formula Implementations
// ===========================================

/**
 * Formula A: Baseline (ES keyword + semantic + tag scores)
 */
function calculateFormulaA(doc, ctx, config = DEFAULT_CONFIG) {
  const signals = {};

  // Keyword matching
  const keywordMatches = (doc.keywords || []).filter(kw => {
    const kwLower = kw.toLowerCase();
    return (ctx.countContext && ctx.countContext.toLowerCase().includes(kwLower)) ||
           (ctx.theoryContext && ctx.theoryContext.toLowerCase().includes(kwLower));
  }).length;
  signals.keyword = Math.min(config.MAX_KEYWORD, keywordMatches * config.POINTS_PER_KEYWORD);

  // Actor name matching
  const actorFound = doc.content && (
    doc.content.toLowerCase().includes(ctx.actorName.toLowerCase()) ||
    (ctx.actorAliases || []).some(a => doc.content.toLowerCase().includes(a.toLowerCase()))
  );
  signals.actor = actorFound ? config.MAX_ACTOR : 0;

  // Tag scores (Brady, Giglio, etc.)
  let tagScore = 0;
  if (doc.tagFeas) {
    for (const [tag, weight] of Object.entries(config.TAG_WEIGHTS)) {
      if (doc.tagFeas[tag]) {
        tagScore += doc.tagFeas[tag] * weight;
      }
    }
  }
  signals.tag = Math.min(config.MAX_TAG, tagScore);

  const score = Math.min(100, signals.keyword + signals.actor + signals.tag);

  // Simple category based on tags
  let defenseCategory = DEFENSE_CATEGORIES.CONTEXT;
  if (doc.tagFeas?.Brady || doc.tagFeas?.Exculpatory) defenseCategory = DEFENSE_CATEGORIES.BRADY;
  else if (doc.tagFeas?.Impeachment || doc.tagFeas?.Giglio) defenseCategory = DEFENSE_CATEGORIES.IMPEACHMENT;
  else if (doc.tagFeas?.Inconsistency) defenseCategory = DEFENSE_CATEGORIES.CONTRADICTION;

  return {
    formulaId: 'formula_a',
    score,
    defenseCategory,
    importanceScore: score,
    signals,
    reasoning: `Keyword: ${signals.keyword}, Actor: ${signals.actor}, Tag: ${signals.tag}`,
    shouldSuggest: score >= config.MIN_CONFIDENCE,
  };
}

/**
 * Formula B: Context-Aware (position, action verbs, signature filtering)
 */
function calculateFormulaB(doc, ctx, config = DEFAULT_CONFIG) {
  const signals = {};

  // Position score
  const position = doc.chunkPosition || detectChunkPosition(doc.content);
  signals.position = position === 'body' ? 20 :
                     position === 'header' ? 10 :
                     position === 'footer' ? -10 :
                     position === 'signature' ? -30 : 0;

  // Action verb score
  const verbCount = countActionVerbs(doc.content, ctx.actorName);
  signals.actionVerbs = Math.min(30, verbCount * 10);

  // Legal terms score
  const legalCount = countLegalTerms(doc.content);
  signals.legalTerms = Math.min(20, legalCount * 5);

  // Signature penalty
  const isSignature = hasSignaturePatterns(doc.content);
  signals.signaturePenalty = isSignature ? -40 : 0;

  // Co-occurring actors bonus
  const coActors = countCoOccurringActors(doc.content, ctx.caseActors || [], ctx.actorName);
  signals.coOccurrence = Math.min(15, coActors.length * 5);

  // Document type bonus
  signals.docType = doc.documentType === 'trial_transcript' ? 30 :
                    doc.documentType === '302' ? 25 :
                    doc.documentType === 'exhibit' ? 20 :
                    doc.documentType === 'email' ? 5 : 0;

  const rawScore = Object.values(signals).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, rawScore));

  // Context-based category
  let defenseCategory = DEFENSE_CATEGORIES.CONTEXT;
  if (signals.signaturePenalty < 0) {
    defenseCategory = DEFENSE_CATEGORIES.ADMINISTRATIVE;
  } else if (signals.actionVerbs >= 20 && signals.legalTerms >= 10) {
    defenseCategory = DEFENSE_CATEGORIES.IMPEACHMENT;
  } else if (signals.coOccurrence >= 10) {
    defenseCategory = DEFENSE_CATEGORIES.CORROBORATION;
  }

  const importanceScore = isSignature ? 10 : score;

  return {
    formulaId: 'formula_b',
    score,
    defenseCategory,
    importanceScore,
    signals,
    reasoning: `Position: ${signals.position}, Verbs: ${signals.actionVerbs}, Legal: ${signals.legalTerms}, Signature: ${signals.signaturePenalty}`,
    shouldSuggest: importanceScore >= config.MIN_CONFIDENCE,
  };
}

/**
 * Formula C: Defense Classification (tag-based category + importance weighting)
 */
function calculateFormulaC(doc, ctx, config = DEFAULT_CONFIG) {
  const signals = {};
  const tags = doc.tagFeas || {};

  // Category priority weights (higher = more important to defense)
  const categoryScores = {
    exculpatory: (tags.Exculpatory || 0) * 50,
    brady: (tags.Brady || 0) * 50,
    impeachment: ((tags.Impeachment || 0) + (tags.Giglio || 0)) * 40,
    contradiction: ((tags.Inconsistency || 0) + (tags['Evidence Conflict'] || 0) + (tags['Witness Inconsistency'] || 0)) * 35,
    corroboration: 0,
    context: 10,
    administrative: 0,
    dismissed: 0,
  };

  // Check if this is administrative
  const isSignature = hasSignaturePatterns(doc.content);
  const position = detectChunkPosition(doc.content);

  if (isSignature || position === 'signature') {
    categoryScores.administrative = 5;
    categoryScores.context = 0;
  }

  // Find best category
  let bestCategory = DEFENSE_CATEGORIES.CONTEXT;
  let bestScore = 0;
  for (const [cat, score] of Object.entries(categoryScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  signals.categoryScore = bestScore;

  // Actor relevance
  const actorFound = doc.content && doc.content.toLowerCase().includes(ctx.actorName.toLowerCase());
  signals.actorRelevance = actorFound ? 20 : 0;

  // Theory alignment
  if (ctx.theoryContext) {
    const theoryKeywords = ctx.theoryContext.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const matchCount = theoryKeywords.filter(kw => doc.content && doc.content.toLowerCase().includes(kw)).length;
    signals.theoryAlignment = Math.min(30, matchCount * 5);
  } else {
    signals.theoryAlignment = 0;
  }

  const rawScore = signals.categoryScore + signals.actorRelevance + signals.theoryAlignment;
  const score = Math.max(0, Math.min(100, rawScore));

  // Importance based on category priority
  const importanceMultiplier = {
    exculpatory: 1.0,
    brady: 1.0,
    impeachment: 0.9,
    contradiction: 0.85,
    corroboration: 0.7,
    context: 0.5,
    administrative: 0.1,
    dismissed: 0,
  };

  const importanceScore = Math.round(score * (importanceMultiplier[bestCategory] || 0.5));

  return {
    formulaId: 'formula_c',
    score,
    defenseCategory: bestCategory,
    importanceScore,
    signals,
    reasoning: `Category: ${bestCategory} (${signals.categoryScore}), Actor: ${signals.actorRelevance}, Theory: ${signals.theoryAlignment}`,
    shouldSuggest: importanceScore >= config.MIN_CONFIDENCE &&
                   bestCategory !== DEFENSE_CATEGORIES.ADMINISTRATIVE &&
                   bestCategory !== DEFENSE_CATEGORIES.DISMISSED,
  };
}

/**
 * Formula D: Combined (weighted blend of A + B + C)
 * This is the primary formula for defense value scoring.
 */
function calculateFormulaD(doc, ctx, config = DEFAULT_CONFIG) {
  // Calculate all base formulas
  const resultA = calculateFormulaA(doc, ctx, config);
  const resultB = calculateFormulaB(doc, ctx, config);
  const resultC = calculateFormulaC(doc, ctx, config);

  // Weights for combination
  const weights = {
    formula_a: 0.3,  // Keyword/tag baseline
    formula_b: 0.35, // Context awareness (most important for filtering junk)
    formula_c: 0.35, // Defense classification
  };

  const signals = {
    formula_a_contribution: resultA.score * weights.formula_a,
    formula_b_contribution: resultB.score * weights.formula_b,
    formula_c_contribution: resultC.score * weights.formula_c,
  };

  const combinedScore = Math.round(
    resultA.score * weights.formula_a +
    resultB.score * weights.formula_b +
    resultC.score * weights.formula_c
  );

  // Use Formula C's category (most defense-focused)
  // But override to administrative if B detected signature
  let defenseCategory = resultC.defenseCategory;
  if (resultB.defenseCategory === DEFENSE_CATEGORIES.ADMINISTRATIVE) {
    defenseCategory = DEFENSE_CATEGORIES.ADMINISTRATIVE;
  }

  // Combined importance: use C's importance but penalize if B detected junk
  let importanceScore = resultC.importanceScore;
  if (resultB.signals.signaturePenalty < 0) {
    importanceScore = Math.round(importanceScore * 0.2); // Heavy penalty for signatures
  }

  return {
    formulaId: 'formula_d',
    score: combinedScore,
    defenseCategory,
    importanceScore,
    signals,
    reasoning: `A: ${resultA.score}, B: ${resultB.score}, C: ${resultC.score} → Combined: ${combinedScore}`,
    shouldSuggest: importanceScore >= config.MIN_CONFIDENCE &&
                   defenseCategory !== DEFENSE_CATEGORIES.ADMINISTRATIVE,
    // Include sub-results for debugging
    subResults: {
      formula_a: resultA,
      formula_b: resultB,
      formula_c: resultC,
    },
  };
}

// ===========================================
// Main API
// ===========================================

/**
 * Score a document-actor link using specified formula
 *
 * @param {Object} doc - Document context
 * @param {string} doc.content - Document/chunk text content
 * @param {string} doc.documentId - Document ID
 * @param {string} doc.documentName - Document name
 * @param {string[]} doc.keywords - Extracted keywords
 * @param {Object} doc.tagFeas - Tag feature scores from ES (e.g., { Brady: 0.8, Impeachment: 0.5 })
 * @param {string} doc.chunkPosition - Position in document ('header', 'body', 'footer', 'signature')
 * @param {string} doc.documentType - Document type ('trial_transcript', 'email', '302', 'exhibit')
 *
 * @param {Object} ctx - Scoring context
 * @param {string} ctx.actorName - Actor being linked
 * @param {string[]} ctx.actorAliases - Actor aliases/alternate names
 * @param {string} ctx.countContext - Count description for relevance
 * @param {string} ctx.theoryContext - Theory/claim being investigated
 * @param {string[]} ctx.caseActors - All known actors in case
 *
 * @param {string} formulaId - Which formula to use ('formula_a', 'formula_b', 'formula_c', 'formula_d')
 * @param {Object} config - Scoring config (optional)
 *
 * @returns {Object} FormulaResult with score, defenseCategory, importanceScore, reasoning
 */
function scoreDocumentActorLink(doc, ctx, formulaId = 'formula_d', config = DEFAULT_CONFIG) {
  switch (formulaId) {
    case 'formula_a':
      return calculateFormulaA(doc, ctx, config);
    case 'formula_b':
      return calculateFormulaB(doc, ctx, config);
    case 'formula_c':
      return calculateFormulaC(doc, ctx, config);
    case 'formula_d':
    default:
      return calculateFormulaD(doc, ctx, config);
  }
}

/**
 * Score with all formulas for comparison (A/B testing)
 */
function scoreAllFormulas(doc, ctx, config = DEFAULT_CONFIG) {
  const results = [
    calculateFormulaA(doc, ctx, config),
    calculateFormulaB(doc, ctx, config),
    calculateFormulaC(doc, ctx, config),
    calculateFormulaD(doc, ctx, config),
  ];

  // Find best formula (highest importance score)
  const bestResult = results.reduce((best, curr) =>
    curr.importanceScore > best.importanceScore ? curr : best
  );

  // Check consensus
  const suggestions = results.map(r => r.shouldSuggest);
  const consensus = suggestions.every(s => s === suggestions[0]);

  // Check category agreement
  const categories = results.map(r => r.defenseCategory);
  const categoryAgreement = categories.every(c => c === categories[0]);

  return {
    documentId: doc.documentId,
    actorName: ctx.actorName,
    results,
    bestFormula: bestResult.formulaId,
    consensus,
    categoryAgreement,
  };
}

/**
 * Quick check if content is likely a signature/administrative
 * Use this for fast filtering before full formula evaluation.
 */
function isLikelyAdministrative(content) {
  if (!content) return false;
  const position = detectChunkPosition(content);
  return position === 'signature' || hasSignaturePatterns(content);
}

// ===========================================
// URE Constraint Integration (Sprint 18+)
// ===========================================

/**
 * Apply URE constraint validation penalty to formula result
 *
 * When Z3 SMT solver finds the claim is UNSATISFIABLE (contradicts known facts),
 * we apply a penalty to the importance score. This helps surface contradictions
 * in the triage inbox.
 *
 * @param {Object} result - Formula result from scoreDocumentActorLink
 * @param {Object} constraintResult - Result from checkConstraints()
 * @param {boolean} constraintResult.hasConflicts - True if UNSAT (contradictory)
 * @param {number} constraintResult.constraintCount - Number of constraints extracted
 * @param {boolean} constraintResult.validated - True if validation completed
 *
 * @returns {Object} Updated formula result with URE adjustments
 */
function applyUREPenalty(result, constraintResult) {
  if (!constraintResult || !constraintResult.validated) {
    // URE not available, return original result
    return {
      ...result,
      ureApplied: false,
      ureReason: 'URE validation not available',
    };
  }

  const updatedResult = { ...result };
  const signals = { ...result.signals };

  if (constraintResult.hasConflicts) {
    // UNSAT: Evidence contradicts known facts
    // This is actually HIGH VALUE for defense - contradictions are gold!

    // Boost importance for contradiction detection
    signals.ure_contradiction_boost = 20;
    updatedResult.importanceScore = Math.min(100, result.importanceScore + 20);

    // Upgrade category to contradiction if not already critical
    if (!['exculpatory', 'brady'].includes(result.defenseCategory)) {
      updatedResult.defenseCategory = DEFENSE_CATEGORIES.CONTRADICTION;
    }

    updatedResult.ureApplied = true;
    updatedResult.ureReason = 'UNSAT: Evidence contradicts known facts - valuable for defense';
    updatedResult.constraintStatus = 'UNSAT';

  } else if (constraintResult.constraintCount > 0) {
    // SAT with constraints: Evidence is logically consistent
    // Small bonus for having extractable structured data
    signals.ure_consistency_bonus = 5;
    updatedResult.importanceScore = Math.min(100, result.importanceScore + 5);

    updatedResult.ureApplied = true;
    updatedResult.ureReason = `SAT: ${constraintResult.constraintCount} constraints validated as consistent`;
    updatedResult.constraintStatus = 'SAT';

  } else {
    // No constraints extracted
    updatedResult.ureApplied = true;
    updatedResult.ureReason = 'No extractable constraints found';
    updatedResult.constraintStatus = 'UNKNOWN';
  }

  updatedResult.signals = signals;
  updatedResult.reasoning = `${result.reasoning} | URE: ${updatedResult.ureReason}`;

  return updatedResult;
}

/**
 * Score with Formula D + URE constraint validation
 * This is Formula E in the plan - combines defense scoring with SMT validation.
 *
 * @param {Object} doc - Document context
 * @param {Object} ctx - Scoring context
 * @param {Object} constraintResult - URE constraint validation result (optional)
 * @param {Object} config - Scoring config
 */
function scoreWithUREValidation(doc, ctx, constraintResult = null, config = DEFAULT_CONFIG) {
  // Calculate base Formula D score
  const baseResult = calculateFormulaD(doc, ctx, config);

  // Apply URE penalty/bonus if available
  if (constraintResult) {
    return applyUREPenalty(baseResult, constraintResult);
  }

  return baseResult;
}

// ===========================================
// Exports
// ===========================================

module.exports = {
  // Main API
  scoreDocumentActorLink,
  scoreAllFormulas,
  isLikelyAdministrative,

  // URE Integration (Sprint 18+)
  applyUREPenalty,
  scoreWithUREValidation,

  // Individual formulas (for testing)
  calculateFormulaA,
  calculateFormulaB,
  calculateFormulaC,
  calculateFormulaD,

  // Utilities
  detectChunkPosition,
  countActionVerbs,
  countLegalTerms,
  hasSignaturePatterns,
  countCoOccurringActors,

  // Constants
  DEFENSE_CATEGORIES,
  DEFAULT_CONFIG,
};
