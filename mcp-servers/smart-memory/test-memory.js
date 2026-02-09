#!/usr/bin/env node
/**
 * Test script for smart-memory MCP server
 * Simulates creating memories about LegalAI tRPC routers
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE = path.join(__dirname, '../../.shared/team-memory.json');

async function testMemoryCreation() {
  console.log('🧪 Testing smart-memory system...\n');

  // Read current memory
  const memoryData = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8'));
  console.log('📖 Current memory state:');
  console.log(`  - Entities: ${Object.keys(memoryData.entities).length}`);
  console.log(`  - Relations: ${memoryData.relations.length}`);
  console.log(`  - Observations: ${memoryData.observations.length}\n`);

  // Create test entity about tRPC routers
  const entityName = 'legalai_trpc_routers';
  memoryData.entities[entityName] = {
    entityType: 'code_location',
    observations: ['trpc_router_location'],
    context: 'legalai',
    createdBy: 'Brett',
    createdAt: new Date().toISOString()
  };

  // Create observation
  memoryData.observations.push({
    id: 'trpc_router_location',
    entityName: entityName,
    content: 'tRPC routers are located in legalai-browser/src/server/routers/ directory. Key routers include: actors.ts (60KB, actor CRUD), validations.ts (triage queue), theories.ts (theory/claim CRUD), counts.ts (criminal counts), snippets.ts (evidence snippets), system.ts (MCP proxy).',
    observedAt: new Date().toISOString(),
    observer: 'Brett',
    confidence: 1.0,
    scope: 'project',
    context: 'legalai'
  });

  // Create relation
  memoryData.relations.push({
    from: entityName,
    to: 'legalai_system',
    relationType: 'part_of',
    context: 'legalai',
    createdAt: new Date().toISOString()
  });

  // Update metadata
  memoryData.last_updated = new Date().toISOString();

  // Write back
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memoryData, null, 2));

  console.log('✅ Test memory created successfully!');
  console.log(`  - Added entity: ${entityName}`);
  console.log(`  - Added observation: trpc_router_location`);
  console.log(`  - Added relation: ${entityName} -> legalai_system\n`);

  // Verify
  const updatedMemory = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8'));
  console.log('📊 Updated memory state:');
  console.log(`  - Entities: ${Object.keys(updatedMemory.entities).length}`);
  console.log(`  - Relations: ${updatedMemory.relations.length}`);
  console.log(`  - Observations: ${updatedMemory.observations.length}\n`);

  // Show the created entity
  console.log('📝 Created entity details:');
  console.log(JSON.stringify(updatedMemory.entities[entityName], null, 2));
  console.log('\n📝 Created observation:');
  console.log(JSON.stringify(updatedMemory.observations[updatedMemory.observations.length - 1], null, 2));

  console.log('\n✨ Memory system test completed successfully!');
  console.log('\n⚠️  Note: Restart Claude Code to load the updated MCP configuration.');
}

testMemoryCreation().catch(console.error);
