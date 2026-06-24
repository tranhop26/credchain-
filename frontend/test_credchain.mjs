// TASK 1 — CredChain: test request_verification + execute_verification
// Candidate already registered from previous run — skip to verification
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { execSync } from 'child_process';

const CONTRACT = '0x9DCED4d359A2969EA094c5DF674e01f3AB309CBf';
// Checksummed — matches str(gl.message.sender_address) stored by register_candidate
const DEPLOYER = '0x47bCb22167703011df4053f7e3379cc95F068929';

const readClient = createClient({ chain: studionet });

function cliWrite(method, ...args) {
  const argStr = args.map(a => `"${a}"`).join(' ');
  const cmd = `genlayer write ${CONTRACT} ${method} --args ${argStr}`;
  console.log(`\n> ${cmd}`);
  const out = execSync(cmd, { encoding: 'utf8', timeout: 120000 });
  console.log(out.slice(0, 300));
  return out;
}

async function main() {
  console.log('=== CREDCHAIN TASK 1 — request + execute verification ===');
  console.log(`Using DEPLOYER (checksummed): ${DEPLOYER}\n`);

  // Verify profile exists with checksummed key
  console.log('--- Check profile exists ---');
  const profile = await readClient.readContract({
    address: CONTRACT, functionName: 'get_candidate_profile', args: [DEPLOYER],
  });
  console.log('Profile:', profile ? profile.slice(0, 100) : '(empty)');

  if (!profile || profile === '{}' || profile === '') {
    console.log('❌ Profile not found with checksummed address. Registering...');
    cliWrite('register_candidate', 'Alice Dev', 'GenLayer Python React', 'https://github.com/tranhop26', 'https://pactkeeper-lac.vercel.app');
  } else {
    console.log('✅ Profile found!');
  }

  // Counter before
  const before = Number(await readClient.readContract({ address: CONTRACT, functionName: 'get_request_counter', args: [] }));
  console.log(`\nrequest_counter BEFORE = ${before}`);

  // request_verification
  console.log('\n--- request_verification ---');
  cliWrite('request_verification', DEPLOYER);

  const after = Number(await readClient.readContract({ address: CONTRACT, functionName: 'get_request_counter', args: [] }));
  console.log(`request_counter AFTER  = ${after}`);

  if (after > before) {
    console.log('✅ request_verification SUCCESS!');
    const requestId = String(after - 1);

    console.log(`\n--- execute_verification("${requestId}") — AI reading GitHub... ---`);
    cliWrite('execute_verification', requestId);

    const result = await readClient.readContract({ address: CONTRACT, functionName: 'get_verification_result', args: [DEPLOYER] });
    console.log('\n✅ Verification result:', result ? result.slice(0, 200) : '(empty)');
  } else {
    console.log('❌ Counter did not increment — see error above');
  }
  console.log('\n=== DONE ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
