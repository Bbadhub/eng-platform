#!/usr/bin/env node
/**
 * Test script for smart-memory MCP server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Testing smart-memory MCP server...\n');

// Set environment
const env = {
  ...process.env,
  MEMORY_FILE_PATH: path.join(__dirname, '..', '..', '.shared', 'team-memory.json')
};

// Spawn the server
const server = spawn('node', [path.join(__dirname, 'index.js')], {
  env,
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send MCP initialize request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  }
};

let stdout = '';
let stderr = '';

server.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('Server response:', data.toString());
});

server.stderr.on('data', (data) => {
  stderr += data.toString();
  console.error('Server stderr:', data.toString());
});

server.on('close', (code) => {
  console.log(`\nServer exited with code ${code}`);
  console.log('\n=== Test Result ===');
  if (code === 0 || stdout.includes('smart-memory')) {
    console.log('✅ Server started successfully');
  } else {
    console.log('❌ Server failed to start');
    console.log('Stderr:', stderr);
  }
});

// Send init request
console.log('Sending initialize request...');
server.stdin.write(JSON.stringify(initRequest) + '\n');

// Close after 2 seconds
setTimeout(() => {
  server.kill();
}, 2000);
