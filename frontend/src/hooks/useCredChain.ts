import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { useState, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { isAddress } from 'viem';

const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || '0xDfc880de4A0463e9E4368cE86Bd2C00BC4a0552f') as `0x${string}`;

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

  if (e instanceof Error || (e && typeof e === 'object')) {
    const err = e as any;
    const msg = err.message || '';

    if (msg === 'Please connect your wallet first') {
      return msg;
    }

    if (msg.includes('Insufficient bond')) return 'You must stake a bond before requesting verification.';
    if (msg.includes('blacklisted')) return 'This candidate is blacklisted and cannot be verified.';
    if (msg.includes('not registered')) return 'This address is not registered as a candidate.';
    if (msg.includes('already completed')) return 'This verification request has already been processed.';
    if (msg.includes('not found')) return 'Verification request not found. Check the request ID.';
    if (msg.includes('CONTRACT_ADDRESS')) return 'Contract address not configured.';
  }

  const realMsg = extractErrorMessage(e);
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
  const sendWrite = useCallback(async (fnName: string, args: unknown[]): Promise<string> => {
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
    if (!activeAddress || !isAddress(activeAddress)) {
      throw new Error(`Invalid active wallet address: ${String(activeAddress)}`);
    }

    // Log active address right before createClient
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

    // 5. Diagnostics details immediately before writeContract
    console.log('[Diagnostic] Active Account:', activeAddress);
    console.log('[Diagnostic] Contract Address:', CONTRACT_ADDRESS);
    console.log('[Diagnostic] Function Name:', fnName);
    console.log('[Diagnostic] Exact Arguments:', args);
    console.log('[Diagnostic] Target Chain ID: 0xf23f');
    console.log('[Diagnostic] Connected Network: studionet');

    // 6. Execute writeContract (DO NOT call connect("studionet"))
    let txHashResult: any;
    try {
      txHashResult = await writeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: fnName,
        args: args as any[],
        value: 0n,
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

    // 7. Extract the transaction hash structure safely
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
    console.log('[Diagnostic] writeContract transaction hash:', txHash);

    // 8. Wait for transaction receipt (waiting for ACCEPTED or FINALIZED status)
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

      // On timeout, query status and accept if ACCEPTED or FINALIZED
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

  // ── registerCandidate ──────────────────────────────────────────────────────
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

  // ── stakeBond ──────────────────────────────────────────────────────────────
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

  // ── requestVerification ───────────────────────────────────────────────────
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
      const hash = await sendWrite('request_verification', [trimmedAddr]);
      const counter = await sendRead<bigint>('get_request_counter', []);
      const requestId = String(Number(counter) - 1);
      succeedTx(hash, `Verification requested! Request ID: ${requestId}`);
      return requestId;
    } catch (e) { failTx(e); return null; }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── executeVerification ───────────────────────────────────────────────────
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
    console.log('[Diagnostic] getCandidateProfile call:', {
      contractAddress: CONTRACT_ADDRESS,
      methodName: 'get_candidate_profile',
      arguments: [cleanAddr],
      rpcEndpoint: 'https://studio.genlayer.com/api',
      chainId: '61999 (0xf23f)'
    });
    try {
      const raw = await sendRead<string>('get_candidate_profile', [cleanAddr]);
      console.log('[Diagnostic] getCandidateProfile raw result:', raw);
      if (!raw || raw === '') return null;
      const parsed = parseJson<CandidateProfile>(raw);
      console.log('[Diagnostic] getCandidateProfile parsed result:', parsed);
      if (!parsed) {
        throw new Error(`Malformed JSON response for candidate profile: ${raw}`);
      }
      return parsed;
    } catch (e: any) {
      console.error('[Diagnostic] getCandidateProfile error details:', {
        error: e,
        message: e?.message,
        shortMessage: e?.shortMessage,
        details: e?.details,
        stack: e?.stack,
      });
      throw e;
    }
  }, []);

  const getVerificationResult = useCallback(async (addr: string): Promise<VerificationResult | null> => {
    if (!addr || !isAddress(addr)) return null;
    const cleanAddr = addr.toLowerCase().trim();
    console.log('[Diagnostic] getVerificationResult call:', {
      contractAddress: CONTRACT_ADDRESS,
      methodName: 'get_verification_result',
      arguments: [cleanAddr],
      rpcEndpoint: 'https://studio.genlayer.com/api',
      chainId: '61999 (0xf23f)'
    });
    try {
      const raw = await sendRead<string>('get_verification_result', [cleanAddr]);
      console.log('[Diagnostic] getVerificationResult raw result:', raw);
      if (!raw || raw === '') return null;
      const parsed = parseJson<VerificationResult>(raw);
      console.log('[Diagnostic] getVerificationResult parsed result:', parsed);
      return parsed;
    } catch (e: any) {
      console.error('[Diagnostic] getVerificationResult error details:', e);
      throw e;
    }
  }, []);

  const isBlacklisted = useCallback(async (addr: string): Promise<boolean> => {
    if (!addr || !isAddress(addr)) return false;
    const cleanAddr = addr.toLowerCase().trim();
    try {
      const res = await sendRead<boolean>('is_blacklisted', [cleanAddr]);
      console.log('[Diagnostic] isBlacklisted result:', res);
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
      const raw = await sendRead<bigint>('get_stake', [cleanAddr]);
      console.log('[Diagnostic] getStake result:', raw);
      return Number(raw);
    } catch (e) {
      console.error('[Diagnostic] getStake error:', e);
      throw e;
    }
  }, []);

  return {
    txState, resetTx, succeedTx,
    registerCandidate, stakeBond, requestVerification, executeVerification,
    getCandidateProfile, getVerificationResult, isBlacklisted, getStake,
    callerAddress: address ?? '',
    contractAddress: CONTRACT_ADDRESS,
  };
}
