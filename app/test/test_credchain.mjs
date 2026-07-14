// TASK 1 — CredChain: test request_verification + execute_verification
import { createClient, createAccount, generatePrivateKey } from 'genlayer-js';
import { CalldataAddress } from 'genlayer-js/types';
import { studionet } from 'genlayer-js/chains';
import { fromHex } from 'viem';
import assert from 'assert';

const CONTRACT = '0xab99837409eD85d94ee5e2b17DeFeC2bCAb5668E';

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

// Custom wait helper conforming to all requirements
async function waitForGenLayerTransaction({
  client,
  hash,
  targetStatus,
  timeoutMs = 120000,
  pollIntervalMs = 2000,
  signal
}) {
  const start = Date.now();
  let lastError = null;

  const targetCodes = [];
  if (typeof targetStatus === 'number') {
    targetCodes.push(targetStatus);
  } else {
    if (targetStatus === 'ACCEPTED') {
      targetCodes.push(5); // ACCEPTED
      targetCodes.push(7); // FINALIZED
    } else if (targetStatus === 'FINALIZED') {
      targetCodes.push(7); // FINALIZED
    }
  }

  let lastLoggedStatus = '';

  while (true) {
    if (signal?.aborted) {
      throw new Error('Transaction polling aborted.');
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for transaction ${hash} to reach status "${targetStatus}". Last error: ${lastError ? lastError.message || lastError : 'none'}`
      );
    }

    try {
      const tx = await client.getTransaction({ hash });
      if (tx) {
        const statusVal = tx.status;
        const statusName = tx.statusName || tx.status_name || '';
        const statusNum = Number(statusVal);

        const currentStatusStr = statusName || String(statusNum);
        if (currentStatusStr !== lastLoggedStatus) {
          console.log(`[Status transition] Tx status: ${currentStatusStr}`);
          lastLoggedStatus = currentStatusStr;
        }

        // Fail immediately on terminal error statuses
        if (
          statusNum === 8 || // CANCELED
          statusNum === 12 || // VALIDATORS_TIMEOUT
          statusNum === 13 || // LEADER_TIMEOUT
          statusNum === 6 || // UNDETERMINED
          statusName === 'CANCELED' ||
          statusName === 'VALIDATORS_TIMEOUT' ||
          statusName === 'LEADER_TIMEOUT' ||
          statusName === 'UNDETERMINED'
        ) {
          throw new Error(`Transaction failed with status: ${currentStatusStr}`);
        }

        // Check if target status achieved
        const matchesNumeric = targetCodes.includes(statusNum);
        const matchesString = typeof targetStatus === 'string' && (
          statusName === targetStatus ||
          (targetStatus === 'ACCEPTED' && statusName === 'FINALIZED')
        );

        if (matchesNumeric || matchesString) {
          return tx;
        }
      }
    } catch (err) {
      lastError = err;
      if (err.message && err.message.includes('Transaction failed with status')) {
        throw err;
      }
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, pollIntervalMs);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Transaction polling aborted.'));
        });
      }
    });
  }
}

// Wrapper for writeContract using writeClient and custom polling
async function sdkWrite(functionName, args, value) {
  console.log(`[SDK Write] Invoking writeContract for function "${functionName}"...`);
  let hash;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      hash = await writeClient.writeContract({
        address: CONTRACT,
        functionName: functionName,
        args: args,
        value: value
      });
      break;
    } catch (err) {
      console.warn(`[SDK Write] Attempt ${attempt} failed to send transaction:`, err.message || err);
      if (attempt === 5) throw err;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  console.log(`[SDK Write] Transaction hash received: ${hash}`);
  console.log('[SDK Write] Waiting for transaction receipt...');
  
  const tx = await waitForGenLayerTransaction({
    client: readClient,
    hash: hash,
    targetStatus: 'ACCEPTED'
  });
  console.log(`[SDK Write] Transaction confirmed successfully with status: ${tx.statusName || tx.status}!`);
  return tx;
}

// Helper unit test runner
async function runUnitTests() {
  console.log('\n=== RUNNING HELPER UNIT TESTS ===');

  // Test 1: Immediate failure on CANCELED status
  try {
    const mockClient = {
      getTransaction: async () => ({ status: 8, statusName: 'CANCELED' })
    };
    await waitForGenLayerTransaction({ client: mockClient, hash: '0x1', targetStatus: 'ACCEPTED', timeoutMs: 5000, pollIntervalMs: 500 });
    assert.fail('Should have failed on CANCELED status');
  } catch (e) {
    assert.ok(e.message.includes('Transaction failed with status: CANCELED'), `Expected cancel failure, got: ${e.message}`);
    console.log('✅ Unit Test 1: CANCELED throws immediately - PASSED');
  }

  // Test 2: Immediate failure on VALIDATORS_TIMEOUT status
  try {
    const mockClient = {
      getTransaction: async () => ({ status: 12, statusName: 'VALIDATORS_TIMEOUT' })
    };
    await waitForGenLayerTransaction({ client: mockClient, hash: '0x2', targetStatus: 'ACCEPTED', timeoutMs: 5000, pollIntervalMs: 500 });
    assert.fail('Should have failed on VALIDATORS_TIMEOUT status');
  } catch (e) {
    assert.ok(e.message.includes('Transaction failed with status: VALIDATORS_TIMEOUT'), `Expected timeout failure, got: ${e.message}`);
    console.log('✅ Unit Test 2: VALIDATORS_TIMEOUT throws immediately - PASSED');
  }

  // Test 3: Temporary RPC error recovery
  let getCalls = 0;
  const mockClientTemp = {
    getTransaction: async () => {
      getCalls++;
      if (getCalls === 1) throw new Error('Temporary connection error');
      return { status: 7, statusName: 'FINALIZED' };
    }
  };
  const txTemp = await waitForGenLayerTransaction({ client: mockClientTemp, hash: '0x3', targetStatus: 'ACCEPTED', timeoutMs: 5000, pollIntervalMs: 500 });
  assert.strictEqual(txTemp.statusName, 'FINALIZED');
  console.log('✅ Unit Test 3: Temporary RPC error recovery - PASSED');

  // Test 4: Total timeout
  try {
    const mockClientTimeout = {
      getTransaction: async () => ({ status: 1, statusName: 'PENDING' })
    };
    await waitForGenLayerTransaction({ client: mockClientTimeout, hash: '0x4', targetStatus: 'ACCEPTED', timeoutMs: 1500, pollIntervalMs: 500 });
    assert.fail('Should have timed out');
  } catch (e) {
    assert.ok(e.message.includes('Timed out waiting for transaction'), `Expected timeout, got: ${e.message}`);
    console.log('✅ Unit Test 4: Total timeout throws error - PASSED');
  }

  // Test 5: Contract-side validator invariants and security tests
  try {
    console.log('[Unit Test 5] Calling run_validator_unit_tests on contract...');
    const result = await readClient.readContract({
      address: CONTRACT,
      functionName: 'run_validator_unit_tests',
      args: []
    });
    console.log(`[Unit Test 5] Result: ${result}`);
    assert.strictEqual(result, 'PASSED', `Validator unit tests failed inside contract: ${result}`);
    console.log('✅ Unit Test 5: Contract-side validator invariants and security tests - PASSED');
  } catch (e) {
    console.error('[Unit Test 5] Error:', e.message || e);
    throw e;
  }

  console.log('=== ALL HELPER UNIT TESTS PASSED ===\n');
}

async function main() {
  await runUnitTests();

  console.log('=== CREDCHAIN TASK 1 — request + execute verification ===');
  console.log(`Using TESTER: ${TESTER}\n`);

  // Verify profile exists with TESTER
  console.log('--- Check profile exists ---');
  let profile = await readClient.readContract({
    address: CONTRACT, functionName: 'get_candidate_profile', args: [toCalldataAddress(TESTER)],
  });
  console.log('Profile:', profile ? profile.slice(0, 100) : '(empty)');

  if (!profile || profile === '{}' || profile === '') {
    console.log('❌ Profile not found for TESTER. Registering...');
    await sdkWrite('register_candidate', ['Alice Dev', 'Python React', 'https://github.com/tranhop26', 'https://pactkeeper-lac.vercel.app']);
    
    // Assert profile exists after registering
    profile = await readClient.readContract({
      address: CONTRACT, functionName: 'get_candidate_profile', args: [toCalldataAddress(TESTER)],
    });
    assert.ok(profile && profile !== '{}' && profile !== '', 'Assertion failed: Profile must exist after registration');
    console.log('✅ Assertion passed: Profile exists after registration');

    console.log('Staking bond...');
    await sdkWrite('stake_bond', [1000]);

    // Assert stake/bond has updated
    const stakeAmount = Number(await readClient.readContract({
      address: CONTRACT, functionName: 'get_stake', args: [toCalldataAddress(TESTER)],
    }));
    assert.strictEqual(stakeAmount, 1000, `Assertion failed: Stake must be 1000, got: ${stakeAmount}`);
    console.log('✅ Assertion passed: Stake balance successfully verified as 1000');
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

  // Assert request counter incremented by exactly 1
  assert.strictEqual(after, before + 1, `Assertion failed: request_counter should be ${before + 1}, got: ${after}`);
  console.log('✅ Assertion passed: Request counter successfully incremented by exactly 1');

  // Assert request ID exists
  const requestId = String(after - 1);
  const reqObjRaw = await readClient.readContract({
    address: CONTRACT, functionName: 'get_request', args: [requestId],
  });
  assert.ok(reqObjRaw && reqObjRaw !== '', `Assertion failed: Request ID ${requestId} does not exist in contract`);
  console.log(`✅ Assertion passed: Request ID ${requestId} exists and fetched successfully`);

  console.log(`\n--- execute_verification("${requestId}") — AI reading GitHub... ---`);
  await sdkWrite('execute_verification', [requestId]);

  // Delay/retry to read the newly committed result
  let result = '';
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    result = await readClient.readContract({ address: CONTRACT, functionName: 'get_verification_result', args: [toCalldataAddress(TESTER)] });
    if (result && result !== '{}' && result !== '') break;
  }
  console.log('\n✅ Verification result:', result ? result.slice(0, 300) : '(empty)');

  // Assert verification result is not empty and has valid structure
  assert.ok(result && result !== '{}' && result !== '', 'Assertion failed: Verification result is empty');
  const resObj = JSON.parse(result);
  assert.ok(resObj.verdict, 'Assertion failed: Verification result does not contain verdict');
  assert.ok(resObj.reasoning, 'Assertion failed: Verification result does not contain reasoning');
  assert.strictEqual(typeof resObj.fraud_detected, 'boolean', 'Assertion failed: fraud_detected must be a boolean');
  console.log('✅ Assertion passed: Verification result has a valid JSON structure');

  console.log('\n=== DONE ===');
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
