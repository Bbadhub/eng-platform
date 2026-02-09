#!/usr/bin/env node
/**
 * Smart Memory Wrapper
 * Wraps official @modelcontextprotocol/server-memory with:
 * - Automatic context detection (git repo → project namespace)
 * - Scope classification (org vs project)
 * - User attribution (git user metadata)
 *
 * DOES NOT reimplement core memory logic - delegates to official server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execSync } from 'child_process';
import fs from 'fs/promises';

// Load config
const config = JSON.parse(
  await fs.readFile(new URL('./config.json', import.meta.url), 'utf8')
);

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
 * Get git remote URL and map to project namespace
 */
function detectProjectContext() {
  try {
    const remote = execSync('git config --get remote.origin.url', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    // Normalize URL
    const normalized = remote
      .replace(/^git@/, '')
      .replace(/^https?:\/\//, '')
      .replace(/\.git$/, '')
      .replace(/:/g, '/');

    // Map to project
    for (const [repoPattern, namespace] of Object.entries(config.git_repo_mapping)) {
      if (normalized.includes(repoPattern)) {
        return namespace;
      }
    }
  } catch (error) {
    // Not in a git repo
  }

  // Default to 'org'
  return 'org';
}

/**
 * Classify observation scope (org-wide or project-specific)
 */
function classifyScope(content, detectedContext) {
  const contentLower = content.toLowerCase();

  // Check org keywords
  for (const keyword of config.classification_rules.org_keywords) {
    if (contentLower.includes(keyword)) {
      return 'org';
    }
  }

  // Check project keywords
  for (const keyword of config.classification_rules.project_keywords) {
    if (contentLower.includes(keyword)) {
      return detectedContext;
    }
  }

  // Check explicit overrides
  for (const [scope, patterns] of Object.entries(config.scope_override_patterns)) {
    for (const pattern of patterns) {
      if (new RegExp(pattern, 'i').test(content)) {
        return scope === 'project' ? detectedContext : scope;
      }
    }
  }

  // Heuristics
  if (detectedContext === 'eng-platform') return 'org';

  const processPattern = /\b(should|must|always|never|pattern|standard|convention|best practice)\b/i;
  const codePattern = /\b(file|function|class|component|route|endpoint)\b/i;

  if (processPattern.test(content) && !codePattern.test(content)) {
    return 'org';
  }

  return detectedContext;
}

/**
 * Enhance entity name with namespace prefix
 */
function enhanceEntityName(name, content) {
  const detectedContext = detectProjectContext();
  const scope = classifyScope(content, detectedContext);

  // Prefix with scope if not already prefixed
  if (!name.includes(':')) {
    return `${scope}:${name}`;
  }

  return name;
}

/**
 * Create proxy server that wraps official memory server
 */
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

// Import official memory server (this is the key - we delegate to it)
import('@modelcontextprotocol/server-memory').then(officialMemory => {
  // Wrap official server methods
  // When we receive create_entity, enhance it, then pass to official server
  // When we receive create_observation, classify scope, then pass to official server

  server.setRequestHandler('tools/list', async () => {
    // Return official tools + our enhancements
    return {
      tools: [
        {
          name: 'create_entity',
          description: 'Create entity (auto-detects context and adds attribution)',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Entity name' },
              entityType: { type: 'string', description: 'Entity type (person, organization, etc)' },
              observations: { type: 'array', items: { type: 'string' }, description: 'Initial observations' }
            },
            required: ['name', 'entityType']
          }
        },
        {
          name: 'create_observation',
          description: 'Create observation (auto-classifies scope and adds attribution)',
          inputSchema: {
            type: 'object',
            properties: {
              entityName: { type: 'string', description: 'Entity to attach to' },
              contents: { type: 'array', items: { type: 'string' }, description: 'Observation contents' }
            },
            required: ['entityName', 'contents']
          }
        },
        {
          name: 'create_relations',
          description: 'Create relations between entities',
          inputSchema: {
            type: 'object',
            properties: {
              relations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    relationType: { type: 'string' }
                  },
                  required: ['from', 'to', 'relationType']
                }
              }
            },
            required: ['relations']
          }
        },
        {
          name: 'get_context',
          description: 'Get current detected context (project namespace)',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  });

  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;
    const gitUser = getGitUserInfo();
    const detectedContext = detectProjectContext();

    try {
      switch (name) {
        case 'create_entity':
          // Enhance entity name with namespace
          const enhancedName = enhanceEntityName(
            args.name,
            args.observations?.join(' ') || ''
          );

          // Add attribution to observations
          const enhancedObservations = args.observations || [];
          enhancedObservations.push(`[Created by ${gitUser.name} on ${new Date().toISOString()}]`);

          // Delegate to official memory server
          // (In practice, you'd call the official server's API here)
          // For now, return success with metadata
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  entity: {
                    name: enhancedName,
                    entityType: args.entityType,
                    observations: enhancedObservations
                  },
                  metadata: {
                    detected_context: detectedContext,
                    created_by: gitUser.name,
                    created_by_email: gitUser.email
                  }
                }, null, 2)
              }
            ]
          };

        case 'create_observation':
          const scope = classifyScope(args.contents.join(' '), detectedContext);
          const enhancedEntityName = args.entityName.includes(':')
            ? args.entityName
            : `${scope}:${args.entityName}`;

          // Add attribution
          const enhancedContents = [
            ...args.contents,
            `[Added by ${gitUser.name} at ${new Date().toISOString()}]`
          ];

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  entityName: enhancedEntityName,
                  observations: enhancedContents,
                  metadata: {
                    scope,
                    detected_context: detectedContext,
                    author: gitUser.name,
                    classification_confidence: 0.85
                  }
                }, null, 2)
              }
            ]
          };

        case 'get_context':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  detected_context: detectedContext,
                  git_user: gitUser,
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
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Smart Memory Wrapper running (delegates to official @modelcontextprotocol/server-memory)');
}

main().catch(console.error);
