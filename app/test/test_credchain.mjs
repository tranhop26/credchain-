// TASK 1 — CredChain: test request_verification + execute_verification
// Candidate already registered from previous run — skip to verification
import { createClient, createAccount, generatePrivateKey } from 'genlayer-js';
import { CalldataAddress } from 'genlayer-js/types';
import { studionet } from 'genlayer-js/chains';
import { fromHex } from 'viem';

const CONTRACT = '0x3E57Cf4f4D71af895EDf695c8ad9dA09732833D3';

const readClient = createClient({ chain: studionet });

// Construct write client using a test key
const privateKey = process.env.PRIVATE_KEY || generatePrivateKey();
const account = createAccount(privateKey);
const writeClient = createClient({
  chain: studionet,
  account: account
});

const TESTER = account.address;

function toCalldataAddress(addr) {
  return new CalldataAddress(fromHex(addr.toLowerCase().trim(), 'bytes'));
}

// Helper to write to contract using writeContract client SDK with custom receipt polling
async function sdkWrite(functionName, args, value) {
  console.log(`[SDK Write] Invoking writeContract for function "${functionName}"...`);
  const hash = await writeClient.writeContract({
    address: CONTRACT,
    functionName: functionName,
    args: args,
    value: value
  });
  console.log(`[SDK Write] Transaction hash received: ${hash}`);
  console.log('[SDK Write] Waiting for transaction receipt...');
  
  // Custom wait loop to bypass genlayer-js SDK localnet status mapping bug
  const retries = 60;
  const interval = 2000;
  let confirmed = false;
  for (let i = 0; i < retries; i++) {
    const tx = await readClient.getTransaction({ hash });
    if (tx) {
      const status = Number(tx.status);
      if (status === 1 || status === 2 || status === 5 || status === 7) {
        console.log(`[SDK Write] Transaction confirmed successfully with status ${status}!`);
        confirmed = true;
        break;
      }
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  if (!confirmed) {
    throw new Error(`Timed out waiting for transaction ${hash}`);
  }
}

async function main() {
  console.log('=== CREDCHAIN TASK 1 — request + execute verification ===');
  console.log(`Using TESTER: ${TESTER}\n`);

  // Verify profile exists with TESTER
  console.log('--- Check profile exists ---');
  const profile = await readClient.readContract({
    address: CONTRACT, functionName: 'get_candidate_profile', args: [toCalldataAddress(TESTER)],
  });
  console.log('Profile:', profile ? profile.slice(0, 100) : '(empty)');

  if (!profile || profile === '{}' || profile === '') {
    console.log('❌ Profile not found for TESTER. Registering...');
    await sdkWrite('register_candidate', ['Alice Dev', 'GenLayer Python React', 'https://github.com/tranhop26', 'https://pactkeeper-lac.vercel.app']);
    console.log('Staking bond...');
    await sdkWrite('stake_bond', [1000]);
  } else {
    console.log('✅ Profile found!');
  }

  // Counter before
  const before = Number(await readClient.readContract({ address: CONTRACT, functionName: 'get_request_counter', args: [] }));
  console.log(`\nrequest_counter BEFORE = ${before}`);

  // request_verification
  console.log('\n--- request_verification ---');
  await sdkWrite('request_verification', [toCalldataAddress(TESTER)]);

  // Delay/retry to handle simulator state synchronization
  let after = before;
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    after = Number(await readClient.readContract({ address: CONTRACT, functionName: 'get_request_counter', args: [] }));
    if (after > before) break;
  }
  console.log(`request_counter AFTER  = ${after}`);

  if (after > before) {
    console.log('✅ request_verification SUCCESS!');
    const requestId = String(after - 1);

    console.log(`\n--- execute_verification("${requestId}") — AI reading GitHub... ---`);
    await sdkWrite('execute_verification', [requestId]);

    // Delay/retry to read the newly committed result
    let result = '';
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      result = await readClient.readContract({ address: CONTRACT, functionName: 'get_verification_result', args: [toCalldataAddress(TESTER)] });
      if (result && result !== '{}' && result !== '') break;
    }
    console.log('\n✅ Verification result:', result ? result.slice(0, 200) : '(empty)');
  } else {
    console.log('❌ Counter did not increment — see error above');
  }
  console.log('\n=== DONE ===');
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
