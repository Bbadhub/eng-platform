#!/usr/bin/env node
/**
 * Smart Memory MCP Server
 * Auto-detects project context from working directory and namespaces memories
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MEMORY_FILE = process.env.MEMORY_FILE_PATH ||
  path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'team-memory.json');

import { execSync } from 'child_process';

// Load configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, 'config.json'), 'utf8')
);

// Project namespace mapping from config
const GIT_REPO_MAP = config.git_repo_mapping;

/**
 * Get git user info (for attribution)
 */
function getGitUserInfo() {
  try {
    const name = execSync('git config user.name', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    const email = execSync('git config user.email', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    return { name: name || 'Unknown', email: email || 'unknown@example.com' };
  } catch (error) {
    return { name: 'Unknown', email: 'unknown@example.com' };
  }
}

/**
 * Get git remote URL for current directory
 */
function getGitRemoteUrl() {
  try {
    const remote = execSync('git config --get remote.origin.url', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    // Normalize URL (handle both HTTPS and SSH formats)
    // git@github.com:user/repo.git → github.com/user/repo
    // https://github.com/user/repo.git → github.com/user/repo
    return remote
      .replace(/^git@/, '')
      .replace(/^https?:\/\//, '')
      .replace(/\.git$/, '')
      .replace(/:/g, '/');
  } catch (error) {
    return null;
  }
}

/**
 * Detect current project context from git remote
 */
function detectProjectContext() {
  const cwd = process.cwd();
  const gitRemote = getGitRemoteUrl();

  // 1. Try git remote mapping (most reliable)
  if (gitRemote) {
    for (const [repoPattern, namespace] of Object.entries(GIT_REPO_MAP)) {
      if (gitRemote.includes(repoPattern)) {
        return namespace;
      }
    }
  }

  // 2. Fallback: Check if in eng-platform (special case for org-wide)
  if (cwd.includes('eng-platform') || cwd.includes('engineering-platform')) {
    return 'org';
  }

  // 3. Default to 'org' namespace if no git repo or unknown repo
  return 'org';
}

/**
 * Load memory from file
 */
async function loadMemory() {
  try {
    const data = await fs.readFile(MEMORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Initialize empty memory
    return {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      entities: {},
      relations: [],
      observations: []
    };
  }
}

/**
 * Save memory to file
 */
async function saveMemory(memory) {
  memory.last_updated = new Date().toISOString();
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf8');
}

/**
 * Create entity with automatic context detection
 */
async function createEntity(name, type, observations) {
  const context = detectProjectContext();
  const memory = await loadMemory();

  // Get git user info for attribution
  const gitUser = getGitUserInfo();

  // Initialize context namespace if it doesn't exist
  if (!memory.entities[context]) {
    memory.entities[context] = {
      name: context,
      entityType: 'namespace',  // ← Changed from 'type' to match Anthropic schema
      observations: []
    };
  }

  // Add entity within context
  const entityKey = `${context}:${name}`;
  memory.entities[entityKey] = {
    name,
    entityType: type,  // ← Changed from 'type' to match Anthropic schema
    context,
    observations: observations || [],
    created_at: new Date().toISOString(),
    created_by: gitUser.name,  // ← User attribution
    created_by_email: gitUser.email
  };

  await saveMemory(memory);

  return {
    success: true,
    entity: memory.entities[entityKey],
    detected_context: context
  };
}

/**
 * Classify observation scope using keyword heuristics
 * Returns: 'org' (organization-wide) or detected project context
 */
function classifyObservationScope(content, detectedContext) {
  const orgKeywords = [
    'all projects',
    'team standard',
    'organization',
    'company-wide',
    'engineering process',
    'code review',
    'deployment process',
    'git workflow',
    'testing strategy',
    'security policy',
    'onboarding',
    'documentation standard'
  ];

  const projectKeywords = [
    'this project',
    'our api',
    'database schema',
    'deployment to',
    'specific to',
    'codebase'
  ];

  const contentLower = content.toLowerCase();

  // Check for explicit org indicators
  for (const keyword of orgKeywords) {
    if (contentLower.includes(keyword)) {
      return 'org';
    }
  }

  // Check for explicit project indicators
  for (const keyword of projectKeywords) {
    if (contentLower.includes(keyword)) {
      return detectedContext;
    }
  }

  // Heuristic: If in eng-platform repo, assume org-wide
  if (detectedContext === 'eng-platform') {
    return 'org';
  }

  // Heuristic: If pattern/process related, likely org-wide
  const processPatterns = /\b(should|must|always|never|pattern|standard|convention|best practice)\b/i;
  if (processPatterns.test(content)) {
    // Ambiguous - check if it mentions specific code
    const codePatterns = /\b(file|function|class|component|route|endpoint)\b/i;
    if (!codePatterns.test(content)) {
      return 'org'; // Process guideline without specific code → org
    }
  }

  // Default: use detected context
  return detectedContext;
}

/**
 * Add observation with automatic context detection and scope classification
 */
async function createObservation(content, explicitScope = null) {
  const detectedContext = detectProjectContext();

  // Classify scope: org-wide or project-specific
  const scope = explicitScope || classifyObservationScope(content, detectedContext);

  const memory = await loadMemory();

  // Get git user info for attribution
  const gitUser = getGitUserInfo();

  const observation = {
    content,
    scope,
    detected_context: detectedContext,
    timestamp: new Date().toISOString(),
    // User attribution (for team tracking)
    author: gitUser.name,
    author_email: gitUser.email,
    // Store classification metadata
    classification: {
      method: explicitScope ? 'explicit' : 'automatic',
      confidence: explicitScope ? 1.0 : 0.8
    }
  };

  memory.observations.push(observation);

  // Add to appropriate namespace entity
  const targetContext = scope;
  if (!memory.entities[targetContext]) {
    memory.entities[targetContext] = {
      name: targetContext,
      entityType: 'namespace',  // ← Changed from 'type' to match Anthropic schema
      observations: []
    };
  }

  memory.entities[targetContext].observations.push(content);

  await saveMemory(memory);

  return {
    success: true,
    observation: content,
    detected_context: detectedContext,
    stored_in_scope: scope,
    classification: observation.classification
  };
}

/**
 * Search memories by context
 */
async function searchMemories(query, contextFilter = null) {
  const memory = await loadMemory();
  const currentContext = contextFilter || detectProjectContext();

  const results = [];

  // Search entities
  for (const [key, entity] of Object.entries(memory.entities)) {
    if (contextFilter && entity.context !== contextFilter && entity.name !== contextFilter) {
      continue; // Skip other contexts if filter is set
    }

    if (JSON.stringify(entity).toLowerCase().includes(query.toLowerCase())) {
      results.push({ type: 'entity', data: entity, relevance: 1.0 });
    }
  }

  // Search observations
  for (const obs of memory.observations) {
    if (contextFilter && obs.context !== contextFilter) {
      continue;
    }

    if (obs.content.toLowerCase().includes(query.toLowerCase())) {
      results.push({ type: 'observation', data: obs, relevance: 0.8 });
    }
  }

  return {
    query,
    context: currentContext,
    results,
    total: results.length
  };
}

// Initialize MCP server
const server = new Server(
  {
    name: 'smart-memory',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'create_entity',
        description: 'Create a new entity in memory (auto-detects project context)',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            observations: { type: 'array', items: { type: 'string' } }
          },
          required: ['name', 'type']
        }
      },
      {
        name: 'create_observation',
        description: 'Create a new observation (auto-detects project context)',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string' }
          },
          required: ['content']
        }
      },
      {
        name: 'search_memories',
        description: 'Search memories with optional context filter',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            context: { type: 'string' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_current_context',
        description: 'Get the auto-detected current project context',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Tool handlers
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'create_entity':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await createEntity(args.name, args.type, args.observations),
                null,
                2
              )
            }
          ]
        };

      case 'create_observation':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await createObservation(args.content),
                null,
                2
              )
            }
          ]
        };

      case 'search_memories':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await searchMemories(args.query, args.context),
                null,
                2
              )
            }
          ]
        };

      case 'get_current_context':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                context: detectProjectContext(),
                cwd: process.cwd()
              }, null, 2)
            }
          ]
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: error.message })
        }
      ],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Smart Memory MCP server running');
}

main().catch(console.error);
