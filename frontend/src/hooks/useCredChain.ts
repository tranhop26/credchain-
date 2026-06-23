import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { useState, useCallback, useRef } from 'react';

// ─── Client Setup ────────────────────────────────────────────────────────────
// CONTRACT_ADDRESS is set via .env.local → VITE_CONTRACT_ADDRESS
const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

// Read client – no wallet needed
const readClient = createClient({ chain: studionet });

// Write account (demo key — in prod this would be MetaMask via window.ethereum)
const writeAccount = createAccount();
const writeClient = createClient({ chain: studionet, account: writeAccount.address });

// ─── Types ───────────────────────────────────────────────────────────────────
export interface CandidateProfile {
  name: string;
  claimed_skills: string;
  github_url: string;
  portfolio_url: string;
  registered_at: number;
  status: 'PENDING' | 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED' | 'BLACKLISTED';
}

export interface VerificationResult {
  verdict: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED';
  confidence: number;
  verified_skills: string[];
  unverified_skills: string[];
  reasoning: string;
  fraud_detected: boolean;
  verified_at: number;
  request_id: string;
  evidence_note?: string;
}

export interface TxState {
  status: 'idle' | 'pending' | 'success' | 'error';
  hash?: string;
  message?: string;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseJson<T>(raw: string): T | null {
  if (!raw || raw === '') return null;
  try { return JSON.parse(raw) as T; }
  catch { return null; }
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('Insufficient bond')) return 'You must stake a bond before requesting verification.';
  if (msg.includes('blacklisted')) return 'This candidate is blacklisted and cannot be verified.';
  if (msg.includes('not registered')) return 'This address is not registered as a candidate.';
  if (msg.includes('already completed')) return 'This verification request has already been processed.';
  if (msg.includes('not found')) return 'Verification request not found. Check the request ID.';
  if (msg.includes('CONTRACT_ADDRESS')) return 'Contract address not configured. Set VITE_CONTRACT_ADDRESS in .env.local';
  return msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
}

async function sendWrite(fnName: string, args: unknown[]): Promise<string> {
  const txHash = await writeClient.writeContract({
    account: writeAccount,
    address: CONTRACT_ADDRESS,
    functionName: fnName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: args as any[],
    value: BigInt(0),
  });
  await writeClient.waitForTransactionReceipt({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hash: txHash as any,
    status: TransactionStatus.FINALIZED,
  });
  return txHash as string;
}

async function sendRead<T>(fnName: string, args: unknown[]): Promise<T> {
  const result = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: fnName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: args as any[],
  });
  return result as T;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useCredChain() {
  const [txState, setTxState] = useState<TxState>({ status: 'idle' });

  const startTx = useCallback((msg: string) => {
    setTxState({ status: 'pending', message: msg });
  }, []);

  const succeedTx = useCallback((hash: string, msg: string) => {
    setTxState({ status: 'success', hash, message: msg });
  }, []);

  const failTx = useCallback((e: unknown) => {
    setTxState({ status: 'error', error: friendlyError(e) });
  }, []);

  const resetTx = useCallback(() => {
    setTxState({ status: 'idle' });
  }, []);

  // ── registerCandidate ──────────────────────────────────────────────────────
  const registerCandidate = useCallback(async (
    name: string,
    claimedSkills: string,
    githubUrl: string,
    portfolioUrl: string,
  ) => {
    startTx('Registering candidate on-chain...');
    try {
      const hash = await sendWrite('register_candidate', [name, claimedSkills, githubUrl, portfolioUrl]);
      succeedTx(hash, 'Candidate registered successfully!');
    } catch (e) { failTx(e); }
  }, [startTx, succeedTx, failTx]);

  // ── stakeBond ──────────────────────────────────────────────────────────────
  const stakeBond = useCallback(async (amount: number) => {
    startTx(`Staking bond of ${amount} units...`);
    try {
      const hash = await sendWrite('stake_bond', [BigInt(amount)]);
      succeedTx(hash, `Bond of ${amount} units staked successfully!`);
    } catch (e) { failTx(e); }
  }, [startTx, succeedTx, failTx]);

  // ── requestVerification ───────────────────────────────────────────────────
  const requestIdRef = useRef<string | null>(null);
  const requestVerification = useCallback(async (candidateAddress: string): Promise<string | null> => {
    startTx('Requesting AI verification...');
    try {
      const hash = await sendWrite('request_verification', [candidateAddress]);
      // Read the request counter to find the latest request_id
      const counter = await sendRead<bigint>('get_request_counter', []);
      const requestId = String(Number(counter) - 1);
      requestIdRef.current = requestId;
      succeedTx(hash, `Verification requested! Request ID: ${requestId}`);
      return requestId;
    } catch (e) { failTx(e); return null; }
  }, [startTx, succeedTx, failTx]);

  // ── executeVerification ───────────────────────────────────────────────────
  const executeVerification = useCallback(async (requestId: string) => {
    startTx('AI validators are analyzing GitHub & portfolio evidence... (30–60 seconds)');
    try {
      const hash = await sendWrite('execute_verification', [requestId]);
      succeedTx(hash, 'AI verification complete! Fetching verdict...');
    } catch (e) { failTx(e); }
  }, [startTx, succeedTx, failTx]);

  // ── Getters ────────────────────────────────────────────────────────────────
  const getCandidateProfile = useCallback(async (address: string): Promise<CandidateProfile | null> => {
    try {
      const raw = await sendRead<string>('get_candidate_profile', [address]);
      return parseJson<CandidateProfile>(raw);
    } catch { return null; }
  }, []);

  const getVerificationResult = useCallback(async (address: string): Promise<VerificationResult | null> => {
    try {
      const raw = await sendRead<string>('get_verification_result', [address]);
      return parseJson<VerificationResult>(raw);
    } catch { return null; }
  }, []);

  const isBlacklisted = useCallback(async (address: string): Promise<boolean> => {
    try {
      return await sendRead<boolean>('is_blacklisted', [address]);
    } catch { return false; }
  }, []);

  const getStake = useCallback(async (address: string): Promise<number> => {
    try {
      const raw = await sendRead<bigint>('get_stake', [address]);
      return Number(raw);
    } catch { return 0; }
  }, []);

  return {
    txState, resetTx,
    registerCandidate, stakeBond, requestVerification, executeVerification,
    getCandidateProfile, getVerificationResult, isBlacklisted, getStake,
    callerAddress: writeAccount.address,
    contractAddress: CONTRACT_ADDRESS,
  };
}
