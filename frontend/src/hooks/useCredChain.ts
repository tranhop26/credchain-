import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { CalldataAddress } from 'genlayer-js/types';
import { useState, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { isAddress, fromHex } from 'viem';

const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || '0xfd36224cc3ea472223d31143C887f11A7B27e11b') as `0x${string}`;

function toCalldataAddress(addr: string): CalldataAddress {
  const clean = addr.toLowerCase().trim();
  return new CalldataAddress(fromHex(clean as `0x${string}`, 'bytes'));
}

const STUDIONET_CHAIN = {
  chainId: '0xF22F', // 61999
  chainName: 'GenLayer Studionet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: ['https://studio.genlayer.com/api'],
};

if (!import.meta.env.VITE_CONTRACT_ADDRESS) {
  console.warn('VITE_CONTRACT_ADDRESS is not configured');
}

// Read-only client
const readClient = createClient({ chain: studionet });

export interface CandidateProfile {
  name: string;
  claimed_skills: string;
  github_url: string;
  portfolio_url: string;
  leetcode_user?: string;
  stackoverflow_id?: string;
  cv_url?: string;
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

function parseJson<T>(raw: string): T | null {
  if (!raw || raw === '') return null;
  try { return JSON.parse(raw) as T; }
  catch { return null; }
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const e = error as any;

    const message =
      e.shortMessage ||
      e.details ||
      e.cause?.shortMessage ||
      e.cause?.details ||
      e.cause?.message ||
      e.message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }

    try {
      return JSON.stringify(error, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value
      );
    } catch {
      return Object.prototype.toString.call(error);
    }
  }

  return String(error);
}

function friendlyError(e: unknown): string {
  console.error('[Raw Error Diagnostics]', e);

  const realMsg = extractErrorMessage(e);
  const msgLower = realMsg.toLowerCase();

  if (msgLower.includes('please connect your wallet first')) {
    return 'Please connect your wallet first';
  }
  if (msgLower.includes('insufficient bond')) {
    return 'You must stake a bond before requesting verification.';
  }
  if (msgLower.includes('blacklisted')) {
    return 'This candidate is blacklisted and cannot perform this action.';
  }
  if (msgLower.includes('not registered') || msgLower.includes('not_registered')) {
    return 'This address is not registered as a candidate.';
  }
  if (msgLower.includes('already completed')) {
    return 'This verification request has already been processed.';
  }
  if (msgLower.includes('not found')) {
    return 'Request or resource not found.';
  }
  if (msgLower.includes('contract_address')) {
    return 'Contract address not configured.';
  }
  if (msgLower.includes('not_authorized') || msgLower.includes('not authorized')) {
    return 'Action not authorized. Only the owner or designated address can execute this.';
  }
  if (msgLower.includes('already_applied') || msgLower.includes('already applied')) {
    return 'You have already applied to this job bounty.';
  }
  if (msgLower.includes('appeal_already_used') || msgLower.includes('appeal already used')) {
    return 'You have already used your single appeal allocation.';
  }
  if (msgLower.includes('invalid_winner') || msgLower.includes('invalid winner')) {
    return 'Winner must be selected from the applicants list.';
  }
  if (msgLower.includes('job is not open') || msgLower.includes('job_not_open')) {
    return 'This job bounty is not currently open.';
  }
  if (msgLower.includes('insufficient staked balance') || msgLower.includes('insufficient balance')) {
    return 'Insufficient staked GEN balance to execute unstake.';
  }

  return realMsg.length > 200 ? realMsg.slice(0, 200) + '...' : realMsg;
}

async function sendRead<T>(fnName: string, args: unknown[], retries = 3, delayMs = 1500): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      const result = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: fnName,
        args: args as any[],
      });
      return result as T;
    } catch (e: any) {
      lastError = e;
      console.warn(`[sendRead] Try ${i + 1} failed for ${fnName}. Retrying in ${delayMs}ms...`, e);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export function useCredChain() {
  const { address } = useWallet();
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

  // Write via MetaMask (window.ethereum)
  const sendWrite = useCallback(async (fnName: string, args: unknown[], value: bigint = 0n): Promise<string> => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error('Please connect your wallet first');

    // 1. Read the current chain ID before every write transaction
    let currentChainId: string;
    try {
      currentChainId = await eth.request({ method: 'eth_chainId' });
    } catch (e: any) {
      console.error("CredChain transaction failure at eth_chainId", {
        error: e,
        name: e?.name,
        message: e?.message,
        shortMessage: e?.shortMessage,
        details: e?.details,
        cause: e?.cause,
        code: e?.code,
        data: e?.data,
        stack: e?.stack,
      });
      throw e;
    }

    console.log('[Diagnostic] Chain ID before switching/validation:', currentChainId);

    const isTargetChain = currentChainId === '0xF22F' || currentChainId === '0xf22f';
    console.log('[Diagnostic] Is switch required?', !isTargetChain);

    // 2. Switch/add network only if not already on GenLayer Studionet
    if (!isTargetChain) {
      try {
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xF22F' }],
        });
        currentChainId = '0xF22F';
      } catch (switchErr: any) {
        console.error("CredChain transaction failure at wallet_switchEthereumChain", {
          error: switchErr,
          name: switchErr?.name,
          message: switchErr?.message,
          shortMessage: switchErr?.shortMessage,
          details: switchErr?.details,
          cause: switchErr?.cause,
          code: switchErr?.code,
          data: switchErr?.data,
          stack: switchErr?.stack,
        });

        // 4902 indicates that the chain has not been added to MetaMask
        if (switchErr.code === 4902) {
          try {
            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [STUDIONET_CHAIN],
            });
            currentChainId = '0xF22F';
          } catch (addErr: any) {
            console.error("CredChain transaction failure at wallet_addEthereumChain", {
              error: addErr,
              name: addErr?.name,
              message: addErr?.message,
              shortMessage: addErr?.shortMessage,
              details: addErr?.details,
              cause: addErr?.cause,
              code: addErr?.code,
              data: addErr?.data,
              stack: addErr?.stack,
            });
            throw addErr;
          }
        } else {
          throw switchErr;
        }
      }

      // Verify chain ID after switching
      try {
        const verifiedChainId = await eth.request({ method: 'eth_chainId' });
        console.log('[Diagnostic] Chain ID after switching:', verifiedChainId);
        if (verifiedChainId !== '0xF22F' && verifiedChainId !== '0xf22f') {
          throw new Error(`Chain switch was not successful. Current chain: ${verifiedChainId}`);
        }
      } catch (e: any) {
        console.error("CredChain chain verification failure", e);
        throw e;
      }
    }

    // 3. Obtain active wallet address
    let accounts: string[];
    try {
      const currentAccounts = await eth.request({ method: 'eth_accounts' }) as string[];
      if (currentAccounts && currentAccounts.length > 0) {
        accounts = currentAccounts;
      } else {
        accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[];
      }
    } catch (e: any) {
      console.error("CredChain transaction failure at eth_requestAccounts", {
        error: e,
        name: e?.name,
        message: e?.message,
        shortMessage: e?.shortMessage,
        details: e?.details,
        cause: e?.cause,
        code: e?.code,
        data: e?.data,
        stack: e?.stack,
      });
      throw e;
    }

    if (!accounts || accounts.length === 0) {
      throw new Error('Please connect your wallet first');
    }

    const activeAddress = accounts[0] as `0x${string}`;
    if (!isAddress(activeAddress)) {
      throw new Error(`Invalid active wallet address: ${String(activeAddress)}`);
    }

    console.log('[Diagnostic] Active wallet address before client setup:', activeAddress);

    // 4. Create the write client with BOTH active account and provider
    let writeClient: any;
    try {
      writeClient = createClient({
        chain: studionet,
        account: activeAddress,
        provider: (window as any).ethereum,
      });
    } catch (e: any) {
      console.error("CredChain transaction failure at createClient", {
        error: e,
        name: e?.name,
        message: e?.message,
        shortMessage: e?.shortMessage,
        details: e?.details,
        cause: e?.cause,
        code: e?.code,
        data: e?.data,
        stack: e?.stack,
      });
      throw e;
    }

    console.log('[Diagnostic] Active Account:', activeAddress);
    console.log('[Diagnostic] Contract Address:', CONTRACT_ADDRESS);
    console.log('[Diagnostic] Function Name:', fnName);
    console.log('[Diagnostic] Exact Arguments:', args);

    // 5. Execute writeContract
    let txHashResult: any;
    try {
      txHashResult = await writeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: fnName,
        args: args as any[],
        value: value,
      });
    } catch (e: any) {
      console.error("CredChain transaction failure at client.writeContract", {
        error: e,
        name: e?.name,
        message: e?.message,
        shortMessage: e?.shortMessage,
        details: e?.details,
        cause: e?.cause,
        code: e?.code,
        data: e?.data,
        stack: e?.stack,
      });
      throw e;
    }

    console.log('[Diagnostic] writeContract raw result:', txHashResult);

    // 6. Extract transaction hash
    let txHash: string;
    if (typeof txHashResult === 'string') {
      txHash = txHashResult;
    } else if (txHashResult && typeof txHashResult === 'object') {
      txHash = txHashResult.hash || txHashResult.txHash || txHashResult.transactionHash || '';
      if (!txHash) {
        txHash = JSON.stringify(txHashResult);
      }
    } else {
      txHash = String(txHashResult);
    }

    console.log('[Diagnostic] Extracted Tx Hash:', txHash);

    // 7. Wait for transaction receipt
    try {
      await readClient.waitForTransactionReceipt({
        hash: txHash as any,
        status: 'ACCEPTED' as any,
        interval: 5000,
        retries: 60,
      });
    } catch (e: any) {
      console.error("CredChain transaction failure at waitForTransactionReceipt", {
        error: e,
        name: e?.name,
        message: e?.message,
        shortMessage: e?.shortMessage,
        details: e?.details,
        cause: e?.cause,
        code: e?.code,
        data: e?.data,
        stack: e?.stack,
      });

      try {
        const receipt = await readClient.getTransactionReceipt({ hash: txHash as any }) as any;
        console.log('[Diagnostic] Timeout fallback receipt:', receipt);
        const status = receipt?.status;
        if (status === 'ACCEPTED' || status === 'FINALIZED') {
          return txHash;
        }
      } catch (receiptErr) {
        console.error("Failed to fetch receipt on timeout", receiptErr);
      }
      throw e;
    }

    return txHash;
  }, []);

  // ── Legacy Register / Stake ───────────────────────────────────────────────
  const registerCandidate = useCallback(async (
    name: string,
    claimedSkills: string,
    githubUrl: string,
    portfolioUrl: string,
  ): Promise<{ success: boolean; hash?: string; error?: string }> => {
    startTx('Registering candidate on-chain...');
    try {
      const hash = await sendWrite('register_candidate', [name, claimedSkills, githubUrl, portfolioUrl]);
      succeedTx(hash, 'Candidate registered successfully!');
      return { success: true, hash };
    } catch (e) {
      failTx(e);
      return { success: false, error: friendlyError(e) };
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  const stakeBond = useCallback(async (amount: number): Promise<{ success: boolean; hash?: string; error?: string }> => {
    startTx(`Staking bond of ${amount} units...`);
    try {
      const hash = await sendWrite('stake_bond', [BigInt(amount)]);
      succeedTx(hash, `Bond of ${amount} units staked!`);
      return { success: true, hash };
    } catch (e) {
      failTx(e);
      return { success: false, error: friendlyError(e) };
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── registerCandidateExtended ──────────────────────────────────────────────
  const registerCandidateExtended = useCallback(async (
    name: string,
    claimedSkills: string,
    githubUrl: string,
    portfolioUrl: string,
    leetcodeUser: string,
    stackoverflowId: string,
    cvUrl: string
  ): Promise<{ success: boolean; hash?: string; error?: string }> => {
    startTx('Registering candidate profile on-chain...');
    try {
      const hash = await sendWrite('register_candidate_extended', [
        name, claimedSkills, githubUrl, portfolioUrl,
        leetcodeUser, stackoverflowId, cvUrl
      ]);
      succeedTx(hash, 'Candidate profile registered successfully!');
      return { success: true, hash };
    } catch (e) {
      failTx(e);
      return { success: false, error: friendlyError(e) };
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── stake ──────────────────────────────────────────────────────────────────
  const stake = useCallback(async (amount: number): Promise<{ success: boolean; hash?: string; error?: string }> => {
    startTx(`Staking ${amount} GEN...`);
    try {
      const hash = await sendWrite('stake', [BigInt(amount)], BigInt(amount));
      succeedTx(hash, `Successfully staked ${amount} GEN!`);
      return { success: true, hash };
    } catch (e) {
      failTx(e);
      return { success: false, error: friendlyError(e) };
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── unstake ────────────────────────────────────────────────────────────────
  const unstake = useCallback(async (amount: number): Promise<{ success: boolean; hash?: string; error?: string }> => {
    startTx(`Unstaking ${amount} GEN...`);
    try {
      const hash = await sendWrite('unstake', [BigInt(amount)]);
      succeedTx(hash, `Successfully unstaked ${amount} GEN!`);
      return { success: true, hash };
    } catch (e) {
      failTx(e);
      return { success: false, error: friendlyError(e) };
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── generateInterviewQuestions ─────────────────────────────────────────────
  const generateInterviewQuestions = useCallback(async (candidateAddress: string): Promise<string | null> => {
    startTx('AI generating technical interview questions... (30–60s)');
    try {
      const hash = await sendWrite('generate_interview_questions', [toCalldataAddress(candidateAddress)]);
      succeedTx(hash, 'AI Interview questions generated!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── submitInterviewAnswers ─────────────────────────────────────────────────
  const submitInterviewAnswers = useCallback(async (candidateAddress: string, answers: string[]): Promise<string | null> => {
    startTx('Submitting interview answers on-chain...');
    try {
      const hash = await sendWrite('submit_interview_answers', [toCalldataAddress(candidateAddress), JSON.stringify(answers)]);
      succeedTx(hash, 'Interview answers submitted!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── gradeInterview ─────────────────────────────────────────────────────────
  const gradeInterview = useCallback(async (candidateAddress: string): Promise<string | null> => {
    startTx('AI validators grading interview answers... (30–60s)');
    try {
      const hash = await sendWrite('grade_interview', [toCalldataAddress(candidateAddress)]);
      succeedTx(hash, 'Interview graded!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── createJobBounty ────────────────────────────────────────────────────────
  const createJobBounty = useCallback(async (title: string, requiredSkills: string, bountyAmount: number): Promise<string | null> => {
    startTx(`Creating job bounty and locking ${bountyAmount} GEN in escrow...`);
    try {
      const hash = await sendWrite('create_job_bounty', [title, requiredSkills, BigInt(bountyAmount)], BigInt(bountyAmount));
      succeedTx(hash, 'Job bounty created and escrow locked successfully!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── cancelJobBounty ────────────────────────────────────────────────────────
  const cancelJobBounty = useCallback(async (jobId: string): Promise<string | null> => {
    startTx('Cancelling job bounty and refunding escrow...');
    try {
      const hash = await sendWrite('cancel_job_bounty', [BigInt(jobId)]);
      succeedTx(hash, 'Job bounty cancelled and refund processed!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── applyToJobBounty ───────────────────────────────────────────────────────
  const applyToJobBounty = useCallback(async (jobId: string): Promise<string | null> => {
    startTx('Submitting job application...');
    try {
      const hash = await sendWrite('apply_to_job_bounty', [BigInt(jobId)]);
      succeedTx(hash, 'Successfully applied to job bounty!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── awardJobBounty ─────────────────────────────────────────────────────────
  const awardJobBounty = useCallback(async (jobId: string, winnerAddress: string): Promise<string | null> => {
    startTx('Releasing job bounty escrow to candidate...');
    try {
      const hash = await sendWrite('award_job_bounty', [BigInt(jobId), toCalldataAddress(winnerAddress)]);
      succeedTx(hash, 'Job bounty awarded and escrow released!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── submitAppeal ───────────────────────────────────────────────────────────
  const submitAppeal = useCallback(async (reasoning: string): Promise<{ success: boolean; hash?: string; error?: string }> => {
    startTx('Submitting appeal with 100 GEN fee...');
    try {
      const hash = await sendWrite('submit_appeal', [reasoning], 100n);
      succeedTx(hash, 'Appeal submitted successfully!');
      return { success: true, hash };
    } catch (e) {
      failTx(e);
      return { success: false, error: friendlyError(e) };
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── executeAppeal ──────────────────────────────────────────────────────────
  const executeAppeal = useCallback(async (candidateAddress: string): Promise<string | null> => {
    startTx('Supreme validators reviewing appeal evidence... (30–60s)');
    try {
      const hash = await sendWrite('execute_appeal', [toCalldataAddress(candidateAddress)]);
      succeedTx(hash, 'Appeal review complete!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── migrateCandidate ───────────────────────────────────────────────────────
  const migrateCandidate = useCallback(async (oldContractAddress: string): Promise<string | null> => {
    startTx('Migrating candidate history from old contract...');
    try {
      const hash = await sendWrite('migrate_candidate', [toCalldataAddress(oldContractAddress)]);
      succeedTx(hash, 'Candidate history migrated!');
      return hash;
    } catch (e) {
      failTx(e);
      return null;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── requestVerification ────────────────────────────────────────────────────
  const requestVerification = useCallback(async (candidateAddress: string): Promise<string | null> => {
    const trimmedAddr = candidateAddress.trim();
    if (!trimmedAddr) {
      failTx(new Error('Candidate address cannot be empty'));
      return null;
    }
    if (!trimmedAddr.startsWith('0x') || trimmedAddr.length !== 42 || !isAddress(trimmedAddr)) {
      failTx(new Error('Invalid candidate address format (must be a valid 0x hex address)'));
      return null;
    }
    startTx('Requesting AI verification of the candidate profile...');
    try {
      const hash = await sendWrite('request_verification', [toCalldataAddress(trimmedAddr)]);
      const counter = await sendRead<bigint>('get_request_counter', []);
      const requestId = String(Number(counter) - 1);
      succeedTx(hash, `Verification requested! Request ID: ${requestId}`);
      return requestId;
    } catch (e) { failTx(e); return null; }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── executeVerification ────────────────────────────────────────────────────
  const executeVerification = useCallback(async (requestId: string) => {
    startTx('AI validators analyzing GitHub & portfolio... (30–60s)');
    try {
      const hash = await sendWrite('execute_verification', [requestId]);
      succeedTx(hash, 'AI verification complete! Fetching verdict...');
    } catch (e) { failTx(e); }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── Getters ────────────────────────────────────────────────────────────────
  const getCandidateProfile = useCallback(async (addr: string): Promise<CandidateProfile | null> => {
    if (!addr || !isAddress(addr)) return null;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<string>('get_candidate_profile', [toCalldataAddress(cleanAddr)]);
      if (!raw || raw === '') return null;
      return parseJson<CandidateProfile>(raw);
    } catch (e: any) {
      console.error('[Diagnostic] getCandidateProfile error:', e);
      throw e;
    }
  }, []);

  const getVerificationResult = useCallback(async (addr: string): Promise<VerificationResult | null> => {
    if (!addr || !isAddress(addr)) return null;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<string>('get_verification_result', [toCalldataAddress(cleanAddr)]);
      if (!raw || raw === '') return null;
      return parseJson<VerificationResult>(raw);
    } catch (e: any) {
      console.error('[Diagnostic] getVerificationResult error:', e);
      throw e;
    }
  }, []);

  const isBlacklisted = useCallback(async (addr: string): Promise<boolean> => {
    if (!addr || !isAddress(addr)) return false;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const res = await sendRead<boolean>('is_blacklisted', [toCalldataAddress(cleanAddr)]);
      return res;
    } catch (e) {
      console.error('[Diagnostic] isBlacklisted error:', e);
      throw e;
    }
  }, []);

  const getStake = useCallback(async (addr: string): Promise<number> => {
    if (!addr || !isAddress(addr)) return 0;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<bigint>('get_stake', [toCalldataAddress(cleanAddr)]);
      return Number(raw);
    } catch (e) {
      console.error('[Diagnostic] getStake error:', e);
      throw e;
    }
  }, []);

  const getReputationScore = useCallback(async (addr: string): Promise<number> => {
    if (!addr || !isAddress(addr)) return 0;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<bigint>('get_reputation_score', [toCalldataAddress(cleanAddr)]);
      return Number(raw);
    } catch (e) {
      console.error('[Diagnostic] getReputationScore error:', e);
      return 0;
    }
  }, []);

  const getCandidateTier = useCallback(async (addr: string): Promise<string> => {
    if (!addr || !isAddress(addr)) return 'NONE';
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<string>('get_candidate_tier', [toCalldataAddress(cleanAddr)]);
      return raw || 'NONE';
    } catch (e) {
      console.error('[Diagnostic] getCandidateTier error:', e);
      return 'NONE';
    }
  }, []);

  const getInterviewQuestions = useCallback(async (addr: string): Promise<string[]> => {
    if (!addr || !isAddress(addr)) return [];
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<string>('get_interview_questions', [toCalldataAddress(cleanAddr)]);
      if (!raw || raw === '') return [];
      return JSON.parse(raw) as string[];
    } catch (e) {
      console.error('[Diagnostic] getInterviewQuestions error:', e);
      return [];
    }
  }, []);

  const getInterviewAnswers = useCallback(async (addr: string): Promise<string[]> => {
    if (!addr || !isAddress(addr)) return [];
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<string>('get_interview_answers', [toCalldataAddress(cleanAddr)]);
      if (!raw || raw === '') return [];
      return JSON.parse(raw) as string[];
    } catch (e) {
      console.error('[Diagnostic] getInterviewAnswers error:', e);
      return [];
    }
  }, []);

  const getInterviewScore = useCallback(async (addr: string): Promise<number> => {
    if (!addr || !isAddress(addr)) return 0;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<bigint>('get_interview_score', [toCalldataAddress(cleanAddr)]);
      return Number(raw);
    } catch (e) {
      console.error('[Diagnostic] getInterviewScore error:', e);
      return 0;
    }
  }, []);

  const getInterviewStatus = useCallback(async (addr: string): Promise<string> => {
    if (!addr || !isAddress(addr)) return 'NOT_STARTED';
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<string>('get_interview_status', [toCalldataAddress(cleanAddr)]);
      return raw || 'NOT_STARTED';
    } catch (e) {
      console.error('[Diagnostic] getInterviewStatus error:', e);
      return 'NOT_STARTED';
    }
  }, []);

  const getJobBounty = useCallback(async (jobId: string): Promise<any | null> => {
    try {
      const raw = await sendRead<string>('get_job_bounty', [BigInt(jobId)]);
      if (!raw || raw === '') return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Diagnostic] getJobBounty error:', e);
      return null;
    }
  }, []);

  const getJobEscrow = useCallback(async (jobId: string): Promise<number> => {
    try {
      const raw = await sendRead<bigint>('get_job_escrow', [BigInt(jobId)]);
      return Number(raw);
    } catch (e) {
      console.error('[Diagnostic] getJobEscrow error:', e);
      return 0;
    }
  }, []);

  const getJobApplicants = useCallback(async (jobId: string): Promise<string[]> => {
    try {
      const raw = await sendRead<string>('get_job_applicants', [BigInt(jobId)]);
      if (!raw || raw === '') return [];
      return JSON.parse(raw) as string[];
    } catch (e) {
      console.error('[Diagnostic] getJobApplicants error:', e);
      return [];
    }
  }, []);

  const getAppeal = useCallback(async (addr: string): Promise<any | null> => {
    if (!addr || !isAddress(addr)) return null;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<string>('get_appeal', [toCalldataAddress(cleanAddr)]);
      if (!raw || raw === '') return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Diagnostic] getAppeal error:', e);
      return null;
    }
  }, []);

  const getAppealUsed = useCallback(async (addr: string): Promise<boolean> => {
    if (!addr || !isAddress(addr)) return false;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<boolean>('get_appeal_used', [toCalldataAddress(cleanAddr)]);
      return !!raw;
    } catch (e) {
      console.error('[Diagnostic] getAppealUsed error:', e);
      return false;
    }
  }, []);

  const getJobBounties = useCallback(async (filter?: 'OPEN' | 'CLOSED'): Promise<any[]> => {
    const list: any[] = [];
    let i = 0n;
    while (true) {
      try {
        const raw = await sendRead<string>('get_job_bounty', [i]);
        if (!raw || raw === '') break;
        const job = JSON.parse(raw);
        if (!filter || job.status === filter) {
          list.push(job);
        }
        i++;
      } catch {
        break;
      }
    }
    return list;
  }, []);

  const getCandidateFullState = useCallback(async (addr: string): Promise<any | null> => {
    if (!addr || !isAddress(addr)) return null;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const raw = await sendRead<string>('get_candidate_full_state', [toCalldataAddress(cleanAddr)]);
      if (!raw || raw === '') return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Diagnostic] getCandidateFullState error:', e);
      return null;
    }
  }, []);

  const getActiveJobsFull = useCallback(async (): Promise<any[]> => {
    try {
      const raw = await sendRead<string>('get_active_jobs_full', []);
      if (!raw || raw === '') return [];
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Diagnostic] getActiveJobsFull error:', e);
      return [];
    }
  }, []);

  return {
    txState, resetTx, succeedTx,
    registerCandidate, stakeBond, requestVerification, executeVerification,
    registerCandidateExtended, stake, unstake,
    generateInterviewQuestions, submitInterviewAnswers, gradeInterview,
    createJobBounty, cancelJobBounty, applyToJobBounty, awardJobBounty,
    submitAppeal, executeAppeal, migrateCandidate,
    getCandidateProfile, getVerificationResult, isBlacklisted, getStake,
    getReputationScore, getCandidateTier, getInterviewQuestions, getInterviewAnswers,
    getInterviewScore, getInterviewStatus, getJobBounty, getJobEscrow, getJobApplicants,
    getAppeal, getAppealUsed, getJobBounties,
    getCandidateFullState, getActiveJobsFull,
    callerAddress: address ?? '',
    contractAddress: CONTRACT_ADDRESS,
  };
}
