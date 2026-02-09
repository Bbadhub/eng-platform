/**
 * Research-Swarm Integration Layer for LegalAI
 *
 * Connects Research-Swarm's ReasoningBank to existing:
 * - Elasticsearch (178K+ document chunks)
 * - RAGFlow semantic search
 * - Basin Analyzer (confidence scoring)
 * - Constraint Validator (Z3 conflict detection)
 *
 * Model routing: Sonnet for planning, Haiku for execution
 */

const { execSync, spawn } = require('child_process');
const http = require('http');

// Configuration from environment
const CONFIG = {
  // Elasticsearch - use Docker network name when running in container
  esHost: process.env.ES_HOST || 'ragflow-es',
  esPort: process.env.ES_PORT || '9200',
  esIndex: process.env.ES_INDEX || 'ragflow_74bea108daab11f0b3cc0242ac120006',

  // RAGFlow
  ragflowToken: process.env.RAGFLOW_API_TOKEN || 'ragflow-isQEmbNKWA1p4SPRSlhu2gaMyhaQnkRyF0xpliZeNdg',
  tenantId: '74bea108daab11f0b3cc0242ac120006',
  primaryKbId: '84988933e77111f09c230242ac130008', // Government Exhibits

  // MCP ports (running on same server)
  ragflowMcp: 3010,
  postgresMcp: 3011,
  basinAnalyzer: 9383,
  constraintValidator: 9385,

  // Model routing
  planningModel: process.env.RESEARCH_SWARM_PLANNING_MODEL || 'claude-sonnet-4-20250514',
  executionModel: process.env.RESEARCH_SWARM_EXECUTION_MODEL || 'claude-3-5-haiku-20241022',
  verificationModel: process.env.RESEARCH_SWARM_VERIFICATION_MODEL || 'claude-3-5-haiku-20241022'
};

/**
 * Execute Elasticsearch query via direct HTTP (works in container)
 */
async function searchElasticsearch(query, size = 20) {
  const esQuery = {
    query: query,
    size: size,
    _source: ['content_with_weight', 'docnm_kwd', 'important_kwd', 'doc_id', 'kb_id']
  };

  return new Promise((resolve) => {
    const postData = JSON.stringify(esQuery);

    const options = {
      hostname: CONFIG.esHost,
      port: parseInt(CONFIG.esPort),
      path: `/${CONFIG.esIndex}/_search`,
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

/**
 * Build boolean query from natural language
 */
function buildBooleanQuery(entities, contextTerms) {
  const must = entities.map(e => ({ match: { content_ltks: e } }));
  const should = contextTerms.map(t => ({ match: { content_ltks: t } }));

  return {
    bool: {
      must: must.length > 0 ? must : undefined,
      should: should.length > 0 ? should : undefined,
      minimum_should_match: should.length > 0 ? 1 : undefined
    }
  };
}

// File-based pattern storage (matches legalai-research-server.js approach)
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const PATTERNS_FILE = path.join(DATA_DIR, 'learned-patterns.json');

function loadPatterns() {
  try {
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf-8'));
  } catch {
    return { patterns: [], version: 1, stats: { searches: 0, feedbackCount: 0 } };
  }
}

function savePatterns(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Store search pattern in ReasoningBank (file-based)
 */
async function storePattern(pattern, reward) {
  try {
    const data = loadPatterns();
    data.patterns.push({
      ...pattern,
      reward,
      storedAt: new Date().toISOString()
    });
    // Keep only last 100 patterns
    if (data.patterns.length > 100) {
      data.patterns = data.patterns.slice(-100);
    }
    data.stats.feedbackCount++;
    savePatterns(data);
    return true;
  } catch (error) {
    console.error('Pattern storage failed:', error.message);
    return false;
  }
}

/**
 * Recall similar patterns from ReasoningBank (simple keyword matching)
 */
async function recallPatterns(query, topK = 5) {
  try {
    const data = loadPatterns();
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Score patterns by keyword overlap
    const scored = data.patterns.map(p => {
      const patternText = (p.goal || p.query || '').toLowerCase();
      const matches = queryWords.filter(w => patternText.includes(w)).length;
      return { ...p, score: matches / queryWords.length };
    });

    // Return top-k by score
    return scored
      .filter(p => p.score > 0.2) // At least 20% keyword overlap
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (error) {
    console.error('Pattern recall failed:', error.message);
    return [];
  }
}

/**
 * Main investigation workflow with learning
 */
async function investigateWithLearning(goal, options = {}) {
  const startTime = Date.now();
  const results = {
    goal,
    subGoals: [],
    findings: [],
    confidence: 0,
    patternsUsed: [],
    duration: 0
  };

  // Step 1: Check ReasoningBank for similar past investigations
  console.log('Checking ReasoningBank for similar patterns...');
  const similarPatterns = await recallPatterns(goal);
  if (similarPatterns.length > 0) {
    console.log(`Found ${similarPatterns.length} similar past investigations`);
    results.patternsUsed = similarPatterns;
  }

  // Step 2: Decompose goal into sub-tasks (simple entity-based decomposition)
  console.log('Decomposing goal into sub-tasks...');
  const entities = extractEntities(goal);
  const contextTerms = extractContext(goal);

  // Create sub-goals from entities and context
  if (entities.length > 0) {
    results.subGoals = entities.map(entity => ({
      task: `Find evidence related to ${entity}`,
      entity,
      depth: 1
    }));
  } else if (contextTerms.length > 0) {
    results.subGoals = contextTerms.map(term => ({
      task: `Search for ${term} mentions`,
      term,
      depth: 1
    }));
  } else {
    // Fallback to original goal
    results.subGoals = [{ task: goal, depth: 1 }];
  }
  console.log(`Decomposed into ${results.subGoals.length} sub-tasks`);

  // Step 3: Execute searches for each sub-goal
  for (const subGoal of results.subGoals) {
    console.log(`Executing: ${subGoal.task || subGoal}`);

    // Extract entities and context from sub-goal
    const taskText = subGoal.task || subGoal;
    const entities = extractEntities(taskText);
    const contextTerms = extractContext(taskText);

    // Build and execute query
    const query = buildBooleanQuery(entities, contextTerms);
    const searchResults = await searchElasticsearch(query);

    if (searchResults.hits?.hits?.length > 0) {
      results.findings.push({
        subGoal: taskText,
        hits: searchResults.hits.total?.value || searchResults.hits.hits.length,
        topResults: searchResults.hits.hits.slice(0, 5).map(h => ({
          doc: h._source.docnm_kwd,
          score: h._score,
          preview: h._source.content_with_weight?.substring(0, 200)
        }))
      });
    }
  }

  // Step 4: Calculate confidence (could call Basin Analyzer here)
  results.confidence = calculateConfidence(results.findings);

  // Step 5: Store successful pattern in ReasoningBank
  results.duration = Date.now() - startTime;
  if (results.confidence > 0.6) {
    await storePattern({
      goal,
      subGoals: results.subGoals,
      findingsCount: results.findings.length,
      duration: results.duration
    }, results.confidence);
    console.log('Pattern stored in ReasoningBank for future use');
  }

  return results;
}

/**
 * Extract legal entities from text
 */
function extractEntities(text) {
  const entities = [];
  const patterns = [
    /\b(DMERX|HealthSplash|PMDRX|Blue Mosaic)\b/gi,
    /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // Names
    /\bGX \d+\b/gi, // Government exhibits
    /\b302\b/g // FBI 302 forms
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) entities.push(...matches);
  }

  return [...new Set(entities)].slice(0, 5);
}

/**
 * Extract context terms from text
 */
function extractContext(text) {
  const contextWords = [
    'compliance', 'compliant', 'feature', 'refuse', 'platform',
    'doctor', 'physician', 'patient', 'interview', 'statement',
    'email', 'skype', 'deposition'
  ];

  return contextWords.filter(w =>
    text.toLowerCase().includes(w)
  );
}

/**
 * Calculate confidence based on findings
 */
function calculateConfidence(findings) {
  if (findings.length === 0) return 0;

  const avgHits = findings.reduce((sum, f) => sum + f.hits, 0) / findings.length;
  const coverage = findings.length / Math.max(findings.length, 3);

  // Normalize to 0-1 range
  const hitScore = Math.min(avgHits / 100, 1);
  const confidenceScore = (hitScore * 0.6) + (coverage * 0.4);

  return Math.round(confidenceScore * 100) / 100;
}

// Export for use in other modules
module.exports = {
  CONFIG,
  searchElasticsearch,
  buildBooleanQuery,
  storePattern,
  recallPatterns,
  investigateWithLearning
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const goal = args.join(' ') || 'Find evidence of compliance-first stance';

  console.log(`\n🔍 LegalAI Research-Swarm Integration`);
  console.log(`Goal: ${goal}\n`);

  investigateWithLearning(goal).then(results => {
    console.log('\n📊 Results:');
    console.log(JSON.stringify(results, null, 2));
  }).catch(err => {
    console.error('Investigation failed:', err);
    process.exit(1);
  });
}
