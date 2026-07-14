// TASK 1 — CredChain: test request_verification + execute_verification
// Candidate already registered from previous run — skip to verification
import { createClient, createAccount, generatePrivateKey } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { execSync } from 'child_process';

const CONTRACT = '0x3E57Cf4f4D71af895EDf695c8ad9dA09732833D3';
const DEPLOYER = '0x47bCb22167703011df4053f7e3379cc95F068929';

const readClient = createClient({ chain: studionet });

// Construct write client using a test key
const privateKey = process.env.PRIVATE_KEY || generatePrivateKey();
const account = createAccount(privateKey);
const writeClient = createClient({
  chain: studionet,
  account: account
});

const TESTER = account.address;

// Helper to write to contract using writeContract client SDK
async function sdkWrite(functionName, args, value) {
  try {
    console.log(`[SDK Write] Invoking writeContract for function "${functionName}"...`);
    const hash = await writeClient.writeContract({
      address: CONTRACT,
      functionName: functionName,
      args: args,
      value: value
    });
    console.log(`[SDK Write] Transaction hash received: ${hash}`);
    console.log('[SDK Write] Waiting for transaction receipt...');
    await readClient.waitForTransactionReceipt({
      hash: hash,
      status: 'ACCEPTED'
    });
    console.log('[SDK Write] Transaction confirmed successfully!');
    return true;
  } catch (e) {
    console.warn(`[SDK Write] SDK transaction failed: ${e.message || e}. Falling back to CLI write...`);
    return false;
  }
}

// Fallback helper to write via CLI command
function cliWrite(method, ...args) {
  const argStr = args.map(a => `"${a}"`).join(' ');
  const cmd = `genlayer write ${CONTRACT} ${method} --args ${argStr}`;
  console.log(`\n> ${cmd}`);
  const out = execSync(cmd, { encoding: 'utf8', timeout: 120000 });
  console.log(out.slice(0, 300));
  return out;
}

// Router for write operations
async function writeAction(method, ...args) {
  const success = await sdkWrite(method, args);
  if (!success) {
    // If falling back to CLI, we use DEPLOYER instead of TESTER since the CLI executes as DEPLOYER
    const mappedArgs = args.map(arg => arg === TESTER ? DEPLOYER : arg);
    cliWrite(method, ...mappedArgs);
  }
}

async function main() {
  console.log('=== CREDCHAIN TASK 1 — request + execute verification ===');
  console.log(`Using TESTER: ${TESTER}\n`);

  // Verify profile exists with TESTER
  console.log('--- Check profile exists ---');
  const profile = await readClient.readContract({
    address: CONTRACT, functionName: 'get_candidate_profile', args: [TESTER],
  });
  console.log('Profile:', profile ? profile.slice(0, 100) : '(empty)');

  if (!profile || profile === '{}' || profile === '') {
    console.log('❌ Profile not found for TESTER. Registering...');
    await writeAction('register_candidate', 'Alice Dev', 'GenLayer Python React', 'https://github.com/tranhop26', 'https://pactkeeper-lac.vercel.app');
    console.log('Staking bond...');
    await writeAction('stake_bond', '1000');
  } else {
    console.log('✅ Profile found!');
  }

  // Counter before
  const before = Number(await readClient.readContract({ address: CONTRACT, functionName: 'get_request_counter', args: [] }));
  console.log(`\nrequest_counter BEFORE = ${before}`);

  // request_verification
  console.log('\n--- request_verification ---');
  await writeAction('request_verification', TESTER);

  const after = Number(await readClient.readContract({ address: CONTRACT, functionName: 'get_request_counter', args: [] }));
  console.log(`request_counter AFTER  = ${after}`);

  if (after > before) {
    console.log('✅ request_verification SUCCESS!');
    const requestId = String(after - 1);

    console.log(`\n--- execute_verification("${requestId}") — AI reading GitHub... ---`);
    await writeAction('execute_verification', requestId);

    const result = await readClient.readContract({ address: CONTRACT, functionName: 'get_verification_result', args: [TESTER] });
    console.log('\n✅ Verification result:', result ? result.slice(0, 200) : '(empty)');
  } else {
    console.log('❌ Counter did not increment — see error above');
  }
  console.log('\n=== DONE ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
