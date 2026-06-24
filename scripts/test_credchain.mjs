// TASK 1 — CredChain end-to-end write test via genlayer-js CLI account
// Tests: register_candidate → stake_bond → request_verification → execute_verification
// Run: node scripts/test_credchain.mjs

import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const CONTRACT = '0x9DCED4d359A2969EA094c5DF674e01f3AB309CBf';
const DEPLOYER = '0x47bcb22167703011df4053f7e3379cc95f068929';

// Read-only client for queries
const readClient = createClient({ chain: studionet });

async function readCounter() {
  const n = await readClient.readContract({
    address: CONTRACT,
    functionName: 'get_request_counter',
    args: [],
  });
  return Number(n);
}

async function readProfile(addr) {
  const raw = await readClient.readContract({
    address: CONTRACT,
    functionName: 'get_candidate_profile',
    args: [addr],
  });
  return raw;
}

// Write via genlayer CLI (uses unlocked OS keychain account)
function cliWrite(method, ...args) {
  const argStr = args.map(a => {
    if (typeof a === 'string' && a.startsWith('0x')) return a;
    if (typeof a === 'number' || typeof a === 'bigint') return String(a);
    return `"${a}"`;
  }).join(' ');
  
  const cmd = `genlayer write ${CONTRACT} ${method} --args ${argStr}`;
  console.log(`\n> ${cmd}`);
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 120000 });
    console.log(out);
    return out;
  } catch (e) {
    console.error('ERROR:', e.stdout || e.message);
    throw e;
  }
}

async function main() {
  console.log('=== CREDCHAIN END-TO-END TEST ===');
  console.log(`Contract: ${CONTRACT}`);
  console.log(`Deployer: ${DEPLOYER}`);

  // STEP 0: unlock account
  console.log('\n--- Step 0: Check account ---');
  try {
    execSync(`genlayer account unlock --account pactkeeper-deployer --password "PactKeeper2026!"`, { encoding: 'utf8' });
    console.log('Account unlocked OK');
  } catch (e) {
    console.log('Already unlocked or error:', e.message.slice(0, 100));
  }

  // STEP 1: counter before
  const counterBefore = await readCounter();
  console.log(`\n--- Step 1: get_request_counter BEFORE = ${counterBefore} ---`);

  // STEP 2: register_candidate (the deployer registers itself as candidate)
  console.log('\n--- Step 2: register_candidate ---');
  cliWrite('register_candidate',
    'Alice Dev',
    'Solidity, Python, GenLayer, React',
    'https://github.com/tranhop26',
    'https://pactkeeper-lac.vercel.app'
  );

  // STEP 3: check profile
  console.log('\n--- Step 3: get_candidate_profile ---');
  const profile = await readProfile(DEPLOYER);
  console.log('Profile:', profile);

  // STEP 4: stake_bond
  console.log('\n--- Step 4: stake_bond(1000) ---');
  cliWrite('stake_bond', 1000);

  // STEP 5: request_verification (deployer verifies itself — demo)
  console.log('\n--- Step 5: request_verification ---');
  cliWrite('request_verification', DEPLOYER);

  // STEP 6: counter after request
  const counterAfterReq = await readCounter();
  console.log(`\n--- Step 6: get_request_counter AFTER request = ${counterAfterReq} ---`);

  if (counterAfterReq > counterBefore) {
    console.log('✅ request_verification SUCCESS — counter incremented!');
    const requestId = String(counterAfterReq - 1);

    // STEP 7: execute_verification (AI reads GitHub + portfolio)
    console.log(`\n--- Step 7: execute_verification("${requestId}") — AI analyzing... ---`);
    console.log('(This may take 30–120 seconds for AI validator consensus)');
    cliWrite('execute_verification', requestId);

    // STEP 8: read result
    const result = await readClient.readContract({
      address: CONTRACT,
      functionName: 'get_verification_result',
      args: [DEPLOYER],
    });
    console.log('\n--- Step 8: get_verification_result ---');
    console.log('Result:', result);
    console.log('\n✅ ALL STEPS PASSED');
  } else {
    console.log('❌ request_verification did NOT increment counter — check revert reason above');
  }

  console.log('\n=== DONE ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
