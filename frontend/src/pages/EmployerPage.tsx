import { useState } from 'react';
import { TxStatus } from '../components/TxStatus';
import { VerificationResultCard } from '../components/VerificationResult';
import { useCredChain, type VerificationResult, type CandidateProfile } from '../hooks/useCredChain';

export function EmployerPage() {
  const {
    txState, resetTx,
    requestVerification, executeVerification,
    getCandidateProfile, getVerificationResult,
  } = useCredChain();

  const [candidateAddr, setCandidateAddr] = useState('');
  const [requestId, setRequestId] = useState('');
  const [manualRequestId, setManualRequestId] = useState('');
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [lookupAddr, setLookupAddr] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupAddr.trim()) return;
    setIsLoadingProfile(true);
    try {
      const [p, r] = await Promise.all([
        getCandidateProfile(lookupAddr.trim()),
        getVerificationResult(lookupAddr.trim()),
      ]);
      setCandidateProfile(p);
      setVerificationResult(r);
      if (p) setCandidateAddr(lookupAddr.trim());
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleRequestVerification = async () => {
    if (!candidateAddr) return;
    resetTx();
    const id = await requestVerification(candidateAddr);
    if (id !== null) {
      setRequestId(id);
      setStep(2);
    }
  };

  const handleExecute = async () => {
    const rid = manualRequestId || requestId;
    if (!rid) return;
    resetTx();
    await executeVerification(rid);
    if (candidateAddr) {
      const [p, r] = await Promise.all([
        getCandidateProfile(candidateAddr),
        getVerificationResult(candidateAddr),
      ]);
      setCandidateProfile(p);
      setVerificationResult(r);
    }
    setStep(3);
  };

  return (
    <div className="page-content fade-in">
      {/* Hero */}
      <div className="hero">
        <div className="hero-badge">Employer Portal</div>
        <h1 className="hero-title">Verify Any Candidate<br />With On-Chain AI</h1>
        <p className="hero-desc">
          Request AI verification for any registered candidate. GenLayer reads their
          GitHub live, reasons about their skills, and commits a tamper-proof verdict.
        </p>
      </div>

      {/* Step 0 — Lookup */}
      <div className="card" style={{ marginBottom: '1.5rem' }} id="employer-lookup-card">
        <div className="card-header">
          <div className="card-icon cyan">🔍</div>
          <div>
            <div className="card-title">Look Up Candidate</div>
            <div className="card-subtitle">Enter a wallet address to see their profile</div>
          </div>
        </div>
        <form onSubmit={handleLookup} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            id="field-lookup-address"
            className="form-input"
            type="text"
            placeholder="0xCandidateAddress..."
            value={lookupAddr}
            onChange={e => setLookupAddr(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button
            id="btn-lookup"
            type="submit"
            className="btn btn-secondary"
            disabled={isLoadingProfile}
          >
            {isLoadingProfile ? 'Looking up...' : 'Look Up'}
          </button>
        </form>

        {candidateProfile && (
          <div className="fade-in" style={{ marginTop: '1.25rem' }}>
            <hr className="divider" style={{ margin: '1rem 0' }} />
            <div className="info-row">
              <span className="info-key">Name</span>
              <span className="info-val">{candidateProfile.name}</span>
            </div>
            <div className="info-row">
              <span className="info-key">Status</span>
              <span className={`verdict-badge ${candidateProfile.status}`} style={{ fontSize: '0.8125rem', padding: '0.25rem 0.75rem' }}>
                {candidateProfile.status}
              </span>
            </div>
            <div className="info-row">
              <span className="info-key">Claimed Skills</span>
              <span className="info-val">{candidateProfile.claimed_skills}</span>
            </div>
            <div className="info-row">
              <span className="info-key">GitHub</span>
              <a href={candidateProfile.github_url} target="_blank" rel="noreferrer" className="tx-hash-link">
                {candidateProfile.github_url} ↗
              </a>
            </div>
          </div>
        )}

        {lookupAddr && !candidateProfile && !isLoadingProfile && (
          <div className="error-alert" style={{ marginTop: '0.75rem' }}>
            <span>⚠</span>
            <span>No candidate found at this address. They may not be registered.</span>
          </div>
        )}
      </div>

      {/* Step 1 — Request Verification */}
      <div className="card" style={{ marginBottom: '1.5rem' }} id="request-verification-card">
        <div className="card-header">
          <div className="card-icon purple">①</div>
          <div>
            <div className="card-title">Step 1: Request Verification</div>
            <div className="card-subtitle">Creates a verification request on-chain and returns a request ID</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <input
            id="field-candidate-address"
            className="form-input"
            type="text"
            placeholder="0xCandidateAddress..."
            value={candidateAddr}
            onChange={e => setCandidateAddr(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button
            id="btn-request-verification"
            type="button"
            className="btn btn-primary"
            disabled={!candidateAddr || txState.status === 'pending'}
            onClick={handleRequestVerification}
          >
            {txState.status === 'pending' && step === 1
              ? <><span className="tx-spinner" style={{ width: 14, height: 14 }} /> Requesting...</>
              : 'Request Verification'
            }
          </button>
        </div>
        {requestId && (
          <div className="tx-status success fade-in">
            <div style={{ fontSize: '1.25rem' }}>✓</div>
            <div className="tx-status-text">
              <div className="tx-status-title" style={{ color: 'var(--green-400)' }}>Request created!</div>
              <div className="tx-status-sub">Request ID: <strong>{requestId}</strong> — use this in Step 2</div>
            </div>
          </div>
        )}
        <TxStatus txState={step === 1 ? txState : { status: 'idle' }} />
      </div>

      {/* Step 2 — Execute AI Verification */}
      <div className="card" style={{ marginBottom: '1.5rem' }} id="execute-verification-card">
        <div className="card-header">
          <div className="card-icon cyan">②</div>
          <div>
            <div className="card-title">Step 2: Execute AI Verification</div>
            <div className="card-subtitle">
              Triggers on-chain AI: reads GitHub → analyzes skills → reaches validator consensus
            </div>
          </div>
        </div>
        <div style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          ⚡ This call triggers <strong style={{ color: 'var(--purple-400)' }}>gl.nondet.web.render</strong> + <strong style={{ color: 'var(--purple-400)' }}>gl.nondet.exec_prompt</strong> on-chain.
          Multiple AI validator nodes reach consensus. Expect <strong style={{ color: 'var(--text-primary)' }}>30–60 seconds</strong>.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            id="field-request-id"
            className="form-input"
            type="text"
            placeholder={requestId || 'Request ID (e.g. 0, 1, 2...)'}
            value={manualRequestId}
            onChange={e => setManualRequestId(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <button
            id="btn-execute-verification"
            type="button"
            className="btn btn-cyan"
            disabled={(!requestId && !manualRequestId) || txState.status === 'pending'}
            onClick={handleExecute}
          >
            {txState.status === 'pending' && step >= 2
              ? <><span className="tx-spinner" style={{ width: 14, height: 14 }} /> AI Analyzing...</>
              : '🤖 Execute AI Verification'
            }
          </button>
        </div>
        <TxStatus
          txState={step >= 2 ? txState : { status: 'idle' }}
          consensusMsg="AI validators are reading GitHub & portfolio on-chain... (30–60 seconds)"
        />
      </div>

      {/* Step 3 — Result */}
      {(verificationResult || step === 3) && (
        <div className="fade-in">
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="section-label">Verification Result</span>
          </div>
          <VerificationResultCard
            result={verificationResult}
            profile={candidateProfile}
            isLoading={false}
          />
        </div>
      )}
    </div>
  );
}
