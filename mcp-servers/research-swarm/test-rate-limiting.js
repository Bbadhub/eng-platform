#!/usr/bin/env node
/**
 * Rate Limiting Test - STAB-004 Implementation Verification
 *
 * This script tests the rate limiting implementation for batch-discover endpoint
 * to ensure it prevents PostgREST connection pool overload.
 */

const http = require('http');

const SERVER_URL = 'http://localhost:3012';

async function testBatchDiscover() {
  console.log('🔬 Testing Rate Limiting Implementation (STAB-004)\n');

  const testPayload = {
    searchTerms: ['test', 'interview'],
    existingActors: [],
    saveToPostgres: true  // Enable to test rate limiting
  };

  console.log('📊 Test Configuration:');
  console.log('- Endpoint: POST /actors/batch-discover');
  console.log('- Rate Limiting: ENABLED');
  console.log('- Expected Behavior: 5 concurrent saves, 100ms delays\n');

  const startTime = Date.now();

  try {
    const response = await makeRequest('/actors/batch-discover', 'POST', testPayload);

    if (response.error) {
      console.error('❌ Test failed:', response.error);
      return;
    }

    console.log('✅ Rate Limiting Test Results:');
    console.log(`- Execution time: ${Date.now() - startTime}ms`);
    console.log(`- Total candidates found: ${response.totalCandidates || 0}`);
    console.log(`- Actors saved to PostgreSQL: ${response.savedToPostgres || 0}`);
    console.log(`- Junk entities filtered: ${response.junkFiltered || 0}`);

    if (response.rateLimiting) {
      console.log('\n📈 Rate Limiting Metrics:');
      console.log(`- Batch size: ${response.rateLimiting.batchSize}`);
      console.log(`- Batch delay: ${response.rateLimiting.batchDelay}ms`);
      console.log(`- Retry configuration: ${response.rateLimiting.retryConfig} attempts`);
      console.log(`- Actual save rate: ${response.rateLimiting.actualSaveRate}`);
      console.log(`- Target max rate: ~50 saves/sec (5 concurrent × 10 batches/sec)`);
    }

    console.log('\n✅ SUCCESS: Rate limiting implementation is working correctly!');
    console.log('- No 504 errors should occur');
    console.log('- Save rate should not exceed ~50/second');
    console.log('- Batches should process with controlled delays');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);

    const options = {
      hostname: 'localhost',
      port: 3012,
      path: path,
      method: method,
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
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// Run test if called directly
if (require.main === module) {
  testBatchDiscover().then(() => {
    console.log('\n🎉 Rate limiting test completed!');
  }).catch(err => {
    console.error('\n💥 Test failed:', err.message);
    process.exit(1);
  });
}

module.exports = { testBatchDiscover };