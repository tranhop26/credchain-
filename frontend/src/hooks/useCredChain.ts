import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { useState, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { isAddress } from 'viem';

const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || '0xDfc880de4A0463e9E4368cE86Bd2C00BC4a0552f') as `0x${string}`;

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

function friendlyError(e: unknown): string {
  console.error('[Raw Error Diagnostics]', e);

  if (e instanceof Error) {
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

    const realMsg = err.shortMessage || err.details || err.cause?.message || err.message || String(e);
    return realMsg.length > 200 ? realMsg.slice(0, 200) + '...' : realMsg;
  }

  const msgStr = String(e);
  return msgStr.length > 200 ? msgStr.slice(0, 200) + '...' : msgStr;
}

async function sendRead<T>(fnName: string, args: unknown[]): Promise<T> {
  const result = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: fnName,
    args: args as any[],
  });
  return result as T;
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

    // 1. Validate the connected chain and switch/add GenLayer Studionet network
    let currentChainId: string;
    try {
      currentChainId = await eth.request({ method: 'eth_chainId' });
    } catch (e) {
      throw new Error(`Failed to query chain ID: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }

    if (currentChainId !== '0xF23F' && currentChainId !== '0xf23f') {
      try {
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xF23F' }],
        });
        currentChainId = '0xF23F';
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          try {
            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xF23F',
                chainName: 'GenLayer Studionet',
                nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
                rpcUrls: ['https://studio.genlayer.com/api'],
              }],
            });
            currentChainId = '0xF23F';
          } catch (addErr: any) {
            throw new Error(`Failed to add GenLayer Studionet network: ${addErr.message || addErr}`, { cause: addErr });
          }
        } else {
          throw new Error(`Failed to switch to GenLayer Studionet network: ${switchErr.message || switchErr}`, { cause: switchErr });
        }
      }
    }

    // 2. Obtain active wallet address
    let accounts: string[];
    try {
      const currentAccounts = await eth.request({ method: 'eth_accounts' }) as string[];
      if (currentAccounts && currentAccounts.length > 0) {
        accounts = currentAccounts;
      } else {
        accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[];
      }
    } catch (e) {
      throw new Error('Please connect your wallet first', { cause: e });
    }

    if (!accounts || accounts.length === 0) {
      throw new Error('Please connect your wallet first');
    }

    const activeAddress = accounts[0] as `0x${string}`;
    if (!activeAddress || !isAddress(activeAddress)) {
      throw new Error(`Invalid active wallet address: ${String(activeAddress)}`);
    }

    // 3. Print diagnostics information (NO keys or secrets)
    console.log('[Diagnostic] Active Address:', activeAddress);
    console.log('[Diagnostic] Current Chain ID:', currentChainId);
    console.log('[Diagnostic] Contract Address:', CONTRACT_ADDRESS);
    console.log('[Diagnostic] Function Name:', fnName);
    console.log('[Diagnostic] Arguments:', args);

    // 4. Set up wallet client with officially supported provider format
    const walletClient = createClient({
      chain: studionet,
      account: activeAddress,
      provider: (window as any).ethereum,
    });

    await (walletClient as any).connect("studionet");

    const txHash = await (walletClient as any).writeContract({
      address: CONTRACT_ADDRESS,
      functionName: fnName,
      args: args as any[],
      value: 0n,
    });

    await readClient.waitForTransactionReceipt({
      hash: txHash as any,
      status: 'FINALIZED' as any,
    });

    return txHash as string;
  }, []);

  // ── registerCandidate ──────────────────────────────────────────────────────
  const registerCandidate = useCallback(async (
    name: string,
    claimedSkills: string,
    githubUrl: string,
    portfolioUrl: string,
  ): Promise<boolean> => {
    startTx('Registering candidate on-chain...');
    try {
      const hash = await sendWrite('register_candidate', [name, claimedSkills, githubUrl, portfolioUrl]);
      succeedTx(hash, 'Candidate registered successfully!');
      return true;
    } catch (e) {
      failTx(e);
      return false;
    }
  }, [startTx, succeedTx, failTx, sendWrite]);

  // ── stakeBond ──────────────────────────────────────────────────────────────
  const stakeBond = useCallback(async (amount: number): Promise<boolean> => {
    startTx(`Staking bond of ${amount} units...`);
    try {
      const hash = await sendWrite('stake_bond', [BigInt(amount)]);
      succeedTx(hash, `Bond of ${amount} units staked!`);
      return true;
    } catch (e) {
      failTx(e);
      return false;
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
    try {
      const raw = await sendRead<string>('get_candidate_profile', [addr]);
      return parseJson<CandidateProfile>(raw);
    } catch { return null; }
  }, []);

  const getVerificationResult = useCallback(async (addr: string): Promise<VerificationResult | null> => {
    if (!addr || !isAddress(addr)) return null;
    try {
      const raw = await sendRead<string>('get_verification_result', [addr]);
      return parseJson<VerificationResult>(raw);
    } catch { return null; }
  }, []);

  const isBlacklisted = useCallback(async (addr: string): Promise<boolean> => {
    if (!addr || !isAddress(addr)) return false;
    try { return await sendRead<boolean>('is_blacklisted', [addr]); }
    catch { return false; }
  }, []);

  const getStake = useCallback(async (addr: string): Promise<number> => {
    if (!addr || !isAddress(addr)) return 0;
    try {
      const raw = await sendRead<bigint>('get_stake', [addr]);
      return Number(raw);
    } catch { return 0; }
  }, []);

  return {
    txState, resetTx,
    registerCandidate, stakeBond, requestVerification, executeVerification,
    getCandidateProfile, getVerificationResult, isBlacklisted, getStake,
    callerAddress: address ?? '',
    contractAddress: CONTRACT_ADDRESS,
  };
}
