/**
 * QueryAnalyzer - LLM-based query understanding for legal investigations
 *
 * Parses complex natural language queries BEFORE worker deployment to:
 * 1. Extract intent (FIND_SUPPORT, FIND_CONTRADICTION, EXPLORE, TIMELINE)
 * 2. Identify thesis (what the user wants to prove/find)
 * 3. Generate alignment markers (keywords that SUPPORT vs CONTRADICT)
 * 4. Create worker-specific search strategies
 */

import Anthropic from '@anthropic-ai/sdk';

// Query intent types
export type QueryIntent = 'FIND_SUPPORT' | 'FIND_CONTRADICTION' | 'EXPLORE' | 'TIMELINE';

// Worker types available for investigation
export type WorkerType = 'witness_analyst' | 'contradiction_hunter' | 'timeline_builder' | 'actor_profiler' | 'financial_investigator';

// Search strategy for a specific worker
export interface WorkerSearchStrategy {
  worker: WorkerType;
  focus: string;
  searchTerms: string[];
  documentTypes?: string[];
  priority: 'high' | 'medium' | 'low';
}

// Full query analysis result
export interface QueryAnalysis {
  // Original query
  originalQuery: string;

  // Intent classification
  intent: QueryIntent;

  // What the user wants to prove/find
  thesis: string;

  // Extracted entities (people, companies, documents)
  entities: string[];

  // Topics/themes to search
  topics: string[];

  // Document types to prioritize
  documentTypes: string[];

  // Keywords that SUPPORT the thesis
  supportingEvidence: string[];

  // Keywords that would CONTRADICT the thesis (flag as counter-evidence)
  contradictingEvidence: string[];

  // Worker-specific search strategies
  searchStrategies: WorkerSearchStrategy[];

  // Confidence in the analysis (0-1)
  confidence: number;

  // Any ambiguities detected
  ambiguities?: string[];
}

// LLM prompt for query analysis
const QUERY_ANALYSIS_PROMPT = `You are a legal investigation query analyzer. Your task is to parse complex natural language queries and extract structured search parameters.

Given a user's investigation query, analyze it and return a JSON object with:

1. **intent**: One of:
   - FIND_SUPPORT: User wants evidence supporting a specific claim
   - FIND_CONTRADICTION: User wants to find inconsistencies/conflicts
   - EXPLORE: Open-ended exploration of a topic
   - TIMELINE: Building a chronological sequence of events

2. **thesis**: A clear statement of what the user wants to prove or find. Be specific.

3. **entities**: List of people, companies, or specific documents mentioned or implied.

4. **topics**: Key themes or subjects to search for.

5. **documentTypes**: Types of documents to prioritize (e.g., "302", "email", "Skype", "deposition").

6. **supportingEvidence**: Keywords/phrases that would SUPPORT the thesis. These are what we're looking for.

7. **contradictingEvidence**: Keywords/phrases that would CONTRADICT the thesis. Findings with these should be flagged as counter-evidence, not hidden.

8. **searchStrategies**: Array of worker-specific strategies:
   - witness_analyst: For testimony, statements, interviews
   - contradiction_hunter: For finding conflicts between sources
   - timeline_builder: For chronological events
   - actor_profiler: For building profiles of individuals
   - financial_investigator: For money trails, payments

9. **confidence**: How confident you are in this analysis (0-1).

10. **ambiguities**: Any unclear aspects that might need clarification.

Return ONLY valid JSON, no markdown formatting.`;

/**
 * Analyze a query using Claude LLM
 */
export async function analyzeQuery(query: string, options?: {
  knownEntities?: string[];
  caseContext?: string;
}): Promise<QueryAnalysis> {
  const client = new Anthropic();

  // Build the user message with context
  let userMessage = `Analyze this legal investigation query:\n\n"${query}"`;

  if (options?.knownEntities && options.knownEntities.length > 0) {
    userMessage += `\n\nKnown entities in this case: ${options.knownEntities.join(', ')}`;
  }

  if (options?.caseContext) {
    userMessage += `\n\nCase context: ${options.caseContext}`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022', // Fast, cheap for query parsing
      max_tokens: 1024,
      system: QUERY_ANALYSIS_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    // Extract text content
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from LLM');
    }

    // Parse JSON response
    const analysis = JSON.parse(textContent.text) as Partial<QueryAnalysis>;

    // Validate and fill defaults
    return {
      originalQuery: query,
      intent: analysis.intent || 'EXPLORE',
      thesis: analysis.thesis || query,
      entities: analysis.entities || [],
      topics: analysis.topics || [],
      documentTypes: analysis.documentTypes || [],
      supportingEvidence: analysis.supportingEvidence || [],
      contradictingEvidence: analysis.contradictingEvidence || [],
      searchStrategies: analysis.searchStrategies || [],
      confidence: analysis.confidence || 0.5,
      ambiguities: analysis.ambiguities
    };
  } catch (error) {
    console.error('[QueryAnalyzer] LLM analysis failed:', error);

    // Fallback to basic regex-based analysis
    return fallbackAnalysis(query);
  }
}

/**
 * Fallback analysis when LLM is unavailable
 * Uses regex patterns for basic entity/intent detection
 */
function fallbackAnalysis(query: string): QueryAnalysis {
  const queryLower = query.toLowerCase();

  // Detect intent from keywords
  let intent: QueryIntent = 'EXPLORE';
  if (queryLower.match(/find|prove|evidence|show|support/)) {
    intent = 'FIND_SUPPORT';
  } else if (queryLower.match(/contradict|inconsisten|conflict|dispute/)) {
    intent = 'FIND_CONTRADICTION';
  } else if (queryLower.match(/timeline|chronolog|sequence|when|history/)) {
    intent = 'TIMELINE';
  }

  // Extract known entities (case-specific)
  const knownEntities: Record<string, string[]> = {
    'DMERX': ['dmerx', 'dmrx'],
    'HealthSplash': ['healthsplash', 'health splash', 'splash'],
    'Blue Mosaic': ['blue mosaic', 'bluemosaic'],
    'Chris Cirri': ['chris cirri', 'cirri'],
    'Gary Cox': ['gary cox', 'cox'],
    'Brett Blackman': ['brett blackman', 'blackman']
  };

  const entities: string[] = [];
  for (const [entity, aliases] of Object.entries(knownEntities)) {
    if (aliases.some(alias => queryLower.includes(alias))) {
      entities.push(entity);
    }
  }

  // Extract document types
  const docTypes: string[] = [];
  if (queryLower.includes('302')) docTypes.push('302');
  if (queryLower.includes('email')) docTypes.push('email');
  if (queryLower.includes('skype')) docTypes.push('Skype');
  if (queryLower.includes('deposition')) docTypes.push('deposition');
  if (queryLower.includes('interview')) docTypes.push('interview');

  // Extract topics
  const topicPatterns: Record<string, string[]> = {
    'compliance': ['compliance', 'compliant', 'non-compliant'],
    'features': ['feature', 'functionality', 'refused', "wouldn't"],
    'alternative': ['alternative', 'own platform', 'left', 'switched', 'went to'],
    'physician': ['doctor', 'physician', 'prescribe', 'decline']
  };

  const topics: string[] = [];
  for (const [topic, patterns] of Object.entries(topicPatterns)) {
    if (patterns.some(p => queryLower.includes(p))) {
      topics.push(topic);
    }
  }

  return {
    originalQuery: query,
    intent,
    thesis: query, // Can't extract thesis without LLM
    entities,
    topics,
    documentTypes: docTypes,
    supportingEvidence: [], // Can't determine without LLM
    contradictingEvidence: [],
    searchStrategies: generateDefaultStrategies(intent, entities, topics),
    confidence: 0.3, // Low confidence for fallback
    ambiguities: ['Using fallback analysis - LLM unavailable']
  };
}

/**
 * Generate default search strategies based on intent
 */
function generateDefaultStrategies(
  intent: QueryIntent,
  entities: string[],
  topics: string[]
): WorkerSearchStrategy[] {
  const strategies: WorkerSearchStrategy[] = [];

  // Always include witness analyst if we have entities
  if (entities.length > 0) {
    strategies.push({
      worker: 'witness_analyst',
      focus: `Find statements from or about ${entities.join(', ')}`,
      searchTerms: entities,
      priority: 'high'
    });
  }

  // Add based on intent
  switch (intent) {
    case 'FIND_CONTRADICTION':
      strategies.push({
        worker: 'contradiction_hunter',
        focus: 'Find conflicts between different sources',
        searchTerms: topics,
        priority: 'high'
      });
      break;

    case 'TIMELINE':
      strategies.push({
        worker: 'timeline_builder',
        focus: 'Build chronological sequence of events',
        searchTerms: [...entities, ...topics],
        priority: 'high'
      });
      break;

    case 'FIND_SUPPORT':
    default:
      strategies.push({
        worker: 'actor_profiler',
        focus: `Profile key entities: ${entities.join(', ')}`,
        searchTerms: entities,
        priority: 'medium'
      });
      break;
  }

  return strategies;
}

/**
 * Score a finding's alignment with the query analysis
 * Returns a score from -100 to +100
 * Negative scores indicate counter-evidence
 */
export function scoreAlignment(
  finding: {
    quote: string;
    document: string;
    entities?: string[];
  },
  analysis: QueryAnalysis
): { score: number; isCounterEvidence: boolean; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const quoteLower = finding.quote.toLowerCase();
  const docLower = finding.document.toLowerCase();

  // Entity match (0-30 pts)
  const matchedEntities = analysis.entities.filter(e =>
    quoteLower.includes(e.toLowerCase()) ||
    finding.entities?.some(fe => fe.toLowerCase().includes(e.toLowerCase()))
  );
  const entityScore = (matchedEntities.length / Math.max(analysis.entities.length, 1)) * 30;
  score += entityScore;
  if (matchedEntities.length > 0) {
    reasons.push(`Mentions ${matchedEntities.length} target entities`);
  }

  // Supporting evidence keywords (+40 pts max)
  const supportingMatches = analysis.supportingEvidence.filter(kw =>
    quoteLower.includes(kw.toLowerCase())
  );
  if (supportingMatches.length > 0) {
    score += Math.min(supportingMatches.length * 10, 40);
    reasons.push(`Contains supporting keywords: ${supportingMatches.join(', ')}`);
  }

  // Contradicting evidence keywords (-20 to -40 pts)
  const contradictingMatches = analysis.contradictingEvidence.filter(kw =>
    quoteLower.includes(kw.toLowerCase())
  );
  if (contradictingMatches.length > 0) {
    score -= Math.min(contradictingMatches.length * 10, 40);
    reasons.push(`Contains contradicting keywords: ${contradictingMatches.join(', ')}`);
  }

  // Document type priority (+20 pts)
  if (analysis.documentTypes.some(dt => docLower.includes(dt.toLowerCase()))) {
    score += 20;
    reasons.push('Matches target document type');
  }

  // Topic relevance (+10 pts)
  const topicMatches = analysis.topics.filter(t => quoteLower.includes(t.toLowerCase()));
  if (topicMatches.length > 0) {
    score += Math.min(topicMatches.length * 5, 10);
    reasons.push(`Covers topics: ${topicMatches.join(', ')}`);
  }

  // Determine if counter-evidence
  const isCounterEvidence = contradictingMatches.length > supportingMatches.length;

  return {
    score: Math.max(-100, Math.min(100, score)),
    isCounterEvidence,
    reason: reasons.join('; ') || 'No specific alignment factors'
  };
}

