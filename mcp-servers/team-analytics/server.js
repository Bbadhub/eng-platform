#!/usr/bin/env node
/**
 * Team Analytics MCP Server
 * Proactive engineer health monitoring and training recommendations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { HealthScoreEngine } from './scoring/health-score.js';
import { AlertEngine } from './scoring/alert-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, 'config.json'), 'utf8')
);

// Initialize engines
const healthEngine = new HealthScoreEngine({
  memoryPath: config.memoryPath,
  repoPath: config.repoPath
});

const alertEngine = new AlertEngine();

// Initialize MCP server
const server = new Server(
  {
    name: 'team-analytics',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Start server
async function main() {
  // Tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'engineer_health',
          description: 'Get health score and alerts for a specific engineer',
          inputSchema: {
            type: 'object',
            properties: {
              engineer_name: { type: 'string', description: 'Engineer name' },
              engineer_email: { type: 'string', description: 'Engineer email (for git history)' },
              timeframe: { type: 'number', description: 'Days to analyze (default: 30)', default: 30 }
            },
            required: ['engineer_name', 'engineer_email']
          }
        },
        {
          name: 'team_insights',
          description: 'Get organization-wide team health and recommendations',
          inputSchema: {
            type: 'object',
            properties: {
              timeframe: { type: 'number', description: 'Days to analyze (default: 30)', default: 30 }
            }
          }
        },
        {
          name: 'daily_summary',
          description: 'Get daily health check summary with proactive alerts',
          inputSchema: {
            type: 'object',
            properties: {
              timeframe: { type: 'number', description: 'Days to analyze (default: 30)', default: 30 }
            }
          }
        },
        {
          name: 'training_recommendations',
          description: 'Get suggested training for engineers',
          inputSchema: {
            type: 'object',
            properties: {
              urgency: { type: 'string', description: 'Filter by urgency (high, medium, low)', enum: ['high', 'medium', 'low', 'all'] }
            }
          }
        },
        {
          name: 'find_mentors',
          description: 'Suggest mentoring pairs based on skills and needs',
          inputSchema: {
            type: 'object',
            properties: {
              mentee: { type: 'string', description: 'Optional: specific engineer needing mentorship' }
            }
          }
        }
      ]
    };
  });

  // Tool handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'engineer_health': {
          const engineer = {
            name: args.engineer_name,
            email: args.engineer_email
          };

          const health = await healthEngine.calculateEngineerHealth(
            engineer,
            args.timeframe || 30
          );

          const alerts = alertEngine.generateAlerts(health);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ...health,
                  alerts
                }, null, 2)
              }
            ]
          };
        }

        case 'team_insights': {
          const engineers = config.engineers;

          const teamHealth = await healthEngine.calculateTeamHealth(
            engineers,
            args.timeframe || 30
          );

          const trainingRecs = alertEngine.generateTrainingRecommendations(
            teamHealth.individual_scores
          );

          const mentoringPairs = alertEngine.generateMentoringPairs(
            teamHealth.individual_scores
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ...teamHealth,
                  training_recommendations: trainingRecs,
                  mentoring_opportunities: mentoringPairs
                }, null, 2)
              }
            ]
          };
        }

        case 'daily_summary': {
          const engineers = config.engineers;

          const teamHealth = await healthEngine.calculateTeamHealth(
            engineers,
            args.timeframe || 30
          );

          const summary = alertEngine.generateDailySummary(teamHealth);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(summary, null, 2)
              }
            ]
          };
        }

        case 'training_recommendations': {
          const engineers = config.engineers;

          const teamHealth = await healthEngine.calculateTeamHealth(engineers, 30);

          const recommendations = alertEngine.generateTrainingRecommendations(
            teamHealth.individual_scores
          );

          const filtered = args.urgency && args.urgency !== 'all'
            ? recommendations.filter(r => r.urgency === args.urgency)
            : recommendations;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  recommendations: filtered,
                  total: filtered.length
                }, null, 2)
              }
            ]
          };
        }

        case 'find_mentors': {
          const engineers = config.engineers;

          const teamHealth = await healthEngine.calculateTeamHealth(engineers, 30);

          const pairs = alertEngine.generateMentoringPairs(
            teamHealth.individual_scores
          );

          const filtered = args.mentee
            ? pairs.filter(p => p.mentee === args.mentee)
            : pairs;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  mentoring_pairs: filtered,
                  total: filtered.length
                }, null, 2)
              }
            ]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error('Tool execution error:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: error.message, stack: error.stack })
          }
        ],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Team Analytics MCP server running');
}

main().catch(console.error);
