#!/usr/bin/env node
/**
 * Beads MCP Server - Subtask Management for Multi-Agent Workflows
 *
 * Workflow Integration:
 * 1. Sprint created (TOML)
 * 2. Preflight checks run
 * 3. Beads decomposes into subtasks with dependencies
 * 4. Multi-agent execution coordinated via Beads
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const server = new Server(
  {
    name: 'beads-integration',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Execute Beads CLI command
 */
function runBeadsCommand(args, options = {}) {
  try {
    const cmd = `bd ${args}`;
    const result = execSync(cmd, {
      encoding: 'utf8',
      cwd: options.cwd || process.cwd(),
      ...options
    });
    return result.trim();
  } catch (error) {
    throw new Error(`Beads command failed: ${error.message}\nStderr: ${error.stderr}`);
  }
}

/**
 * Parse Beads JSON output
 */
function parseBeadsJSON(output) {
  try {
    return JSON.parse(output);
  } catch (error) {
    // If not JSON, return raw output
    return { raw: output };
  }
}

// MCP Tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'beads_decompose_sprint',
        description: 'Decompose a sprint task into subtasks with dependencies. Creates Beads tasks from sprint TOML.',
        inputSchema: {
          type: 'object',
          properties: {
            sprint_file: {
              type: 'string',
              description: 'Path to sprint TOML file'
            },
            parent_issue: {
              type: 'string',
              description: 'GitHub issue number or description for parent task'
            }
          },
          required: ['sprint_file', 'parent_issue']
        }
      },
      {
        name: 'beads_create_subtask',
        description: 'Create a subtask with optional dependencies',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title'
            },
            description: {
              type: 'string',
              description: 'Task description'
            },
            depends_on: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of task IDs this depends on (e.g., ["bd-a1b2", "bd-c3d4"])'
            },
            assignee: {
              type: 'string',
              description: 'Agent or engineer assigned (e.g., "agent-api", "agent-ui", "human")'
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Labels like "subtask", "agent-task", "frontend", "backend"'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'beads_list_ready',
        description: 'List tasks ready to be worked on (dependencies satisfied, status=ready)',
        inputSchema: {
          type: 'object',
          properties: {
            assignee: {
              type: 'string',
              description: 'Filter by assignee (optional)'
            }
          }
        }
      },
      {
        name: 'beads_get_task',
        description: 'Get detailed task information including dependencies',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Beads task ID (e.g., bd-a1b2)'
            }
          },
          required: ['task_id']
        }
      },
      {
        name: 'beads_update_status',
        description: 'Update task status (e.g., in-progress, done, blocked)',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Beads task ID'
            },
            status: {
              type: 'string',
              enum: ['ready', 'in-progress', 'blocked', 'done'],
              description: 'New status'
            },
            note: {
              type: 'string',
              description: 'Optional note about status change'
            }
          },
          required: ['task_id', 'status']
        }
      },
      {
        name: 'beads_dependency_graph',
        description: 'Get dependency graph for current sprint tasks',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['json', 'mermaid'],
              default: 'json',
              description: 'Output format'
            }
          }
        }
      },
      {
        name: 'beads_sprint_progress',
        description: 'Get sprint progress summary (tasks completed, blocked, in-progress)',
        inputSchema: {
          type: 'object',
          properties: {
            sprint_label: {
              type: 'string',
              description: 'Sprint label to filter by (optional)'
            }
          }
        }
      }
    ]
  };
});

// Tool Handlers
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'beads_decompose_sprint': {
        // Read sprint TOML
        const sprintContent = fs.readFileSync(args.sprint_file, 'utf8');

        // Parse TOML (simple parser for demo - use proper TOML parser in production)
        const tasks = extractTasksFromSprint(sprintContent);

        // Create parent task
        const parentTitle = `Sprint: ${args.parent_issue}`;
        const parentCmd = `new "${parentTitle}" --label sprint`;
        const parentOutput = runBeadsCommand(parentCmd);
        const parentId = extractTaskId(parentOutput);

        // Create subtasks with dependencies
        const createdTasks = [];
        for (const task of tasks) {
          let cmd = `new "${task.title}" --label subtask`;
          if (task.depends_on && task.depends_on.length > 0) {
            cmd += ` --depends ${task.depends_on.join(',')}`;
          }
          if (task.assignee) {
            cmd += ` --assignee ${task.assignee}`;
          }

          const output = runBeadsCommand(cmd);
          createdTasks.push({
            title: task.title,
            id: extractTaskId(output),
            depends_on: task.depends_on || []
          });
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              parent_task: parentId,
              subtasks: createdTasks,
              total: createdTasks.length,
              message: `Created ${createdTasks.length} subtasks for sprint ${args.parent_issue}`
            }, null, 2)
          }]
        };
      }

      case 'beads_create_subtask': {
        let cmd = `new "${args.title}"`;

        if (args.description) {
          cmd += ` --description "${args.description}"`;
        }
        if (args.depends_on && args.depends_on.length > 0) {
          cmd += ` --depends ${args.depends_on.join(',')}`;
        }
        if (args.assignee) {
          cmd += ` --assignee ${args.assignee}`;
        }
        if (args.labels) {
          args.labels.forEach(label => {
            cmd += ` --label ${label}`;
          });
        }

        const output = runBeadsCommand(cmd);
        const taskId = extractTaskId(output);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              task_id: taskId,
              title: args.title,
              depends_on: args.depends_on || [],
              assignee: args.assignee || null,
              status: 'ready',
              message: `Created task ${taskId}`
            }, null, 2)
          }]
        };
      }

      case 'beads_list_ready': {
        let cmd = 'list --status ready --json';
        if (args.assignee) {
          cmd += ` --assignee ${args.assignee}`;
        }

        const output = runBeadsCommand(cmd);
        const tasks = parseBeadsJSON(output);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ready_tasks: tasks,
              count: Array.isArray(tasks) ? tasks.length : 0,
              message: `Found ${Array.isArray(tasks) ? tasks.length : 0} ready tasks`
            }, null, 2)
          }]
        };
      }

      case 'beads_get_task': {
        const output = runBeadsCommand(`show ${args.task_id} --json`);
        const task = parseBeadsJSON(output);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(task, null, 2)
          }]
        };
      }

      case 'beads_update_status': {
        let cmd = `edit ${args.task_id} --status ${args.status}`;
        if (args.note) {
          cmd += ` --note "${args.note}"`;
        }

        const output = runBeadsCommand(cmd);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              task_id: args.task_id,
              status: args.status,
              note: args.note || null,
              message: `Updated task ${args.task_id} to ${args.status}`
            }, null, 2)
          }]
        };
      }

      case 'beads_dependency_graph': {
        const output = runBeadsCommand('list --json');
        const tasks = parseBeadsJSON(output);

        if (args.format === 'mermaid') {
          const mermaid = generateMermaidGraph(tasks);
          return {
            content: [{
              type: 'text',
              text: mermaid
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks,
              graph: buildDependencyGraph(tasks)
            }, null, 2)
          }]
        };
      }

      case 'beads_sprint_progress': {
        let cmd = 'list --json';
        if (args.sprint_label) {
          cmd += ` --label ${args.sprint_label}`;
        }

        const output = runBeadsCommand(cmd);
        const tasks = parseBeadsJSON(output);

        const progress = calculateProgress(tasks);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(progress, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error.message,
          tool: name
        }, null, 2)
      }],
      isError: true
    };
  }
});

// Helper Functions
function extractTaskId(output) {
  // Extract task ID from Beads output (e.g., "Created bd-a1b2c3")
  const match = output.match(/bd-[a-f0-9]+/);
  return match ? match[0] : null;
}

function extractTasksFromSprint(sprintContent) {
  // Simple TOML parser for tasks
  // In production, use proper TOML parser like @iarna/toml
  const tasks = [];
  const taskBlocks = sprintContent.split(/\[\[tasks?\]\]/g).slice(1);

  taskBlocks.forEach(block => {
    const titleMatch = block.match(/title\s*=\s*"([^"]+)"/);
    const dependsMatch = block.match(/depends_on\s*=\s*\[([^\]]+)\]/);
    const assigneeMatch = block.match(/assignee\s*=\s*"([^"]+)"/);

    if (titleMatch) {
      tasks.push({
        title: titleMatch[1],
        depends_on: dependsMatch ? dependsMatch[1].split(',').map(s => s.trim().replace(/"/g, '')) : [],
        assignee: assigneeMatch ? assigneeMatch[1] : null
      });
    }
  });

  return tasks;
}

function buildDependencyGraph(tasks) {
  const graph = {};

  if (Array.isArray(tasks)) {
    tasks.forEach(task => {
      graph[task.id] = {
        title: task.title,
        status: task.status,
        depends_on: task.depends_on || [],
        blocked_by: [],
        blocks: []
      };
    });

    // Calculate blocks relationships
    Object.keys(graph).forEach(taskId => {
      const task = graph[taskId];
      task.depends_on.forEach(depId => {
        if (graph[depId]) {
          graph[depId].blocks.push(taskId);
          task.blocked_by.push(depId);
        }
      });
    });
  }

  return graph;
}

function generateMermaidGraph(tasks) {
  let mermaid = 'graph TD\n';

  if (Array.isArray(tasks)) {
    tasks.forEach(task => {
      const nodeId = task.id.replace(/-/g, '_');
      const status = task.status || 'ready';
      const style = status === 'done' ? ':::done' : status === 'in-progress' ? ':::inprogress' : '';

      mermaid += `  ${nodeId}["${task.title}"]${style}\n`;

      if (task.depends_on && task.depends_on.length > 0) {
        task.depends_on.forEach(depId => {
          const depNodeId = depId.replace(/-/g, '_');
          mermaid += `  ${depNodeId} --> ${nodeId}\n`;
        });
      }
    });

    mermaid += '\n  classDef done fill:#90EE90\n';
    mermaid += '  classDef inprogress fill:#FFD700\n';
  }

  return mermaid;
}

function calculateProgress(tasks) {
  if (!Array.isArray(tasks)) {
    return { total: 0, completed: 0, in_progress: 0, blocked: 0, ready: 0 };
  }

  const progress = {
    total: tasks.length,
    completed: 0,
    in_progress: 0,
    blocked: 0,
    ready: 0,
    completion_percent: 0
  };

  tasks.forEach(task => {
    switch (task.status) {
      case 'done':
        progress.completed++;
        break;
      case 'in-progress':
        progress.in_progress++;
        break;
      case 'blocked':
        progress.blocked++;
        break;
      case 'ready':
        progress.ready++;
        break;
    }
  });

  progress.completion_percent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return progress;
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Beads MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
