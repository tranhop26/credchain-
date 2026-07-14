import { useState, useEffect, useCallback } from 'react';
import { TxStatus } from '../components/TxStatus';
import { VerificationResultCard } from '../components/VerificationResult';
import { useCredChain, type VerificationResult, type CandidateProfile } from '../hooks/useCredChain';
import { useWallet } from '../context/WalletContext';

export function EmployerPage() {
  const { error: walletError } = useWallet();
  const {
    txState, resetTx,
    requestVerification, executeVerification,
    createJobBounty, cancelJobBounty, applyToJobBounty, awardJobBounty,
    getCandidateFullState, getActiveJobsFull,
    callerAddress,
  } = useCredChain();

  // Verification Portal State
  const [candidateAddr, setCandidateAddr] = useState('');
  const [requestId, setRequestId] = useState('');
  const [manualRequestId, setManualRequestId] = useState('');
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [lookupAddr, setLookupAddr] = useState('');
  const [verifyStep, setVerifyStep] = useState<1 | 2 | 3>(1);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Job Bounties State
  const [activeTab, setActiveTab] = useState<'verify' | 'jobs'>('verify');
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  // Create Job Form State
  const [jobTitle, setJobTitle] = useState('');
  const [jobSkills, setJobSkills] = useState('');
  const [jobBountyAmount, setJobBountyAmount] = useState('');

  // Award Selection State
  const [selectedWinner, setSelectedWinner] = useState<{ [jobId: string]: string }>({});

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupAddr.trim()) return;
    setIsLoadingProfile(true);
    setErrorState(null);
    try {
      const state = await getCandidateFullState(lookupAddr.trim());
      if (state) {
        const p = state.profile ? JSON.parse(state.profile) : null;
        const r = state.verification_result ? JSON.parse(state.verification_result) : null;
        setCandidateProfile(p);
        setVerificationResult(r);
        if (p) {
          setCandidateAddr(lookupAddr.trim());
        } else {
          setErrorState('Candidate genuinely not registered.');
        }
      } else {
        setCandidateProfile(null);
        setVerificationResult(null);
        setErrorState('Candidate genuinely not registered.');
      }
    } catch (err: any) {
      console.error('[EmployerPage] handleLookup error:', err);
      const msg = err.message || err.details || String(err);
      setErrorState(msg);
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
      setVerifyStep(2);
    }
  };

  const handleExecute = async () => {
    const rid = manualRequestId || requestId;
    if (!rid) return;
    resetTx();
    await executeVerification(rid);
    if (candidateAddr) {
      const state = await getCandidateFullState(candidateAddr);
      if (state) {
        setCandidateProfile(state.profile ? JSON.parse(state.profile) : null);
        setVerificationResult(state.verification_result ? JSON.parse(state.verification_result) : null);
      }
    }
    setVerifyStep(3);
  };

  // Job Bounties functions
  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    try {
      const detailedJobs = await getActiveJobsFull();
      setJobsList(detailedJobs);
    } catch (err: any) {
      console.error('[EmployerPage] loadJobs error:', err);
    } finally {
      setIsLoadingJobs(false);
    }
  }, [getActiveJobsFull]);

  useEffect(() => {
    if (activeTab === 'jobs') {
      loadJobs();
    }
  }, [activeTab, loadJobs]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(jobBountyAmount);
    if (!jobTitle.trim() || !jobSkills.trim() || !amount || amount <= 0) return;
    resetTx();
    const hash = await createJobBounty(jobTitle, jobSkills, amount);
    if (hash) {
      setJobTitle('');
      setJobSkills('');
      setJobBountyAmount('');
      await loadJobs();
    }
  };

  const handleApplyJob = async (jobId: string) => {
    resetTx();
    const hash = await applyToJobBounty(jobId);
    if (hash) {
      await loadJobs();
    }
  };

  const handleCancelJob = async (jobId: string) => {
    resetTx();
    const hash = await cancelJobBounty(jobId);
    if (hash) {
      await loadJobs();
    }
  };

  const handleAwardJob = async (jobId: string) => {
    const winner = selectedWinner[jobId];
    if (!winner) return;
    resetTx();
    const hash = await awardJobBounty(jobId, winner);
    if (hash) {
      await loadJobs();
    }
  };

  return (
    <div className="page-content fade-in">
      {/* Hero */}
      <div className="hero">
        <div className="hero-badge">Employer Portal</div>
        <h1 className="hero-title">Verify Candidates &<br />Escrow Job Bounties</h1>
        <p className="hero-desc">
          Query candidate profiles, request AI verification, or post job listings with GEN escrow
          bounties that automatically reward verified candidates upon selection.
        </p>
      </div>

      {walletError && (
        <div className="error-alert fade-in" style={{ marginBottom: '1.5rem' }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>{walletError}</span>
        </div>
      )}

      {errorState && (
        <div className="error-alert fade-in" style={{ marginBottom: '1.5rem' }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>Read/Sync Error: {errorState}</span>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="tab-group" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          id="tab-verify"
          className={`tab-btn${activeTab === 'verify' ? ' active' : ''}`}
          onClick={() => setActiveTab('verify')}
        >
          Verify Candidates
        </button>
        <button
          id="tab-jobs"
          className={`tab-btn${activeTab === 'jobs' ? ' active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          Job Escrow & Bounties
        </button>
      </div>

      {/* Tab: Verify Candidates */}
      {activeTab === 'verify' && (
        <div className="fade-in">
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
                <hr className="divider" style={{ border: '0', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Name</span>
                  <span className="info-val" style={{ fontWeight: 600 }}>{candidateProfile.name}</span>
                </div>
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Status</span>
                  <span className={`verdict-badge ${candidateProfile.status}`} style={{ fontSize: '0.8125rem', padding: '0.25rem 0.75rem' }}>
                    {candidateProfile.status}
                  </span>
                </div>
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Claimed Skills</span>
                  <span className="info-val">{candidateProfile.claimed_skills}</span>
                </div>
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="info-key" style={{ color: 'var(--text-secondary)' }}>GitHub</span>
                  <a href={candidateProfile.github_url} target="_blank" rel="noreferrer" className="tx-hash-link" style={{ color: 'var(--cyan-400)', textDecoration: 'none' }}>
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

            <div style={{ marginBottom: '1rem', fontSize: '0.875rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Employer / Requester Wallet:</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--purple-400)' }}>{callerAddress || '(not connected)'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Selected Candidate Wallet:</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--cyan-400)' }}>{candidateAddr || '(none)'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Transaction Status:</span>
                <span style={{ color: txState.status === 'error' ? 'var(--red-400)' : txState.status === 'success' ? 'var(--green-400)' : 'var(--text-primary)' }}>{txState.status.toUpperCase()}</span>
              </div>
              {requestId && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Resulting Request ID:</span>
                  <strong style={{ color: 'var(--green-400)' }}>{requestId}</strong>
                </div>
              )}
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
                disabled={!callerAddress || !candidateAddr || txState.status === 'pending'}
                onClick={handleRequestVerification}
              >
                {txState.status === 'pending' && verifyStep === 1
                  ? <><span className="tx-spinner" style={{ width: 14, height: 14 }} /> Đang chờ đồng thuận từ GenLayer validators...</>
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
            <TxStatus txState={verifyStep === 1 ? txState : { status: 'idle' }} />
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
                {txState.status === 'pending' && verifyStep >= 2
                  ? <><span className="tx-spinner" style={{ width: 14, height: 14 }} /> Đang chờ đồng thuận từ GenLayer validators...</>
                  : '🤖 Execute AI Verification'
                }
              </button>
            </div>
            <TxStatus
              txState={verifyStep >= 2 ? txState : { status: 'idle' }}
              consensusMsg="AI validators are reading GitHub & portfolio on-chain... (30–60 seconds)"
            />
          </div>

          {/* Step 3 — Result */}
          {(verificationResult || verifyStep === 3) && (
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
      )}

      {/* Tab: Job Escrow & Bounties */}
      {activeTab === 'jobs' && (
        <div className="fade-in">
          {/* Create Job Bounty */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <div className="card-icon purple">+</div>
              <div>
                <div className="card-title">Create Job Bounty Escrow</div>
                <div className="card-subtitle">Lock GEN tokens in escrow to reward the chosen candidate</div>
              </div>
            </div>
            <form onSubmit={handleCreateJob}>
              <div className="form-group">
                <label className="form-label">Job Title</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Senior Smart Contract Engineer"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Required Skills</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Python, Solidity, Vyper"
                  value={jobSkills}
                  onChange={e => setJobSkills(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Escrow Bounty Amount (GEN)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 1500"
                  value={jobBountyAmount}
                  onChange={e => setJobBountyAmount(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={txState.status === 'pending' || !callerAddress}
              >
                Create Job & Deposit Escrow
              </button>
            </form>
            <TxStatus txState={txState} consensusMsg="Locking escrow and creating job bounty..." />
          </div>

          {/* Active Job Bounties List */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: '1rem' }}>
              <div className="card-icon cyan">📋</div>
              <div style={{ flex: 1 }}>
                <div className="card-title">Active Job Listings</div>
                <div className="card-subtitle">Listings deployed on Studionet with active escrows</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={loadJobs} disabled={isLoadingJobs}>
                {isLoadingJobs ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {isLoadingJobs && jobsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="tx-spinner" style={{ margin: '0 auto 1rem', width: 24, height: 24 }} />
                <span>Loading active job bounties...</span>
              </div>
            ) : jobsList.length === 0 ? (
              <div className="empty-state" style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="empty-state-icon">💼</div>
                <div>No job bounties created yet</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {jobsList.map((job) => {
                  const isOwner = callerAddress && job.employer?.toLowerCase() === callerAddress.toLowerCase();
                  return (
                    <div
                      key={job.id}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: '1.25rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <div>
                          <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{job.title}</strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Employer: <span style={{ fontFamily: 'monospace' }}>{job.employer}</span>
                          </div>
                        </div>
                        <span className={`verdict-badge ${job.status}`} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                          {job.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Required Skills:</span>{' '}
                        <strong style={{ color: 'var(--cyan-400)' }}>{job.required_skills}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem' }}>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Escrow Funds:</span>{' '}
                          <strong style={{ color: 'var(--purple-400)', fontSize: '1.05rem' }}>{job.escrow} GEN</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Applicants:</span>{' '}
                          <strong style={{ color: 'var(--text-primary)' }}>{job.applicants?.length || 0}</strong>
                        </div>
                      </div>

                      {/* Applicants Sub-Section */}
                      {job.applicants && job.applicants.length > 0 && (
                        <div style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Applicants:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {job.applicants.map((app: string) => (
                              <span key={app} style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                • {app}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {/* Employer Actions */}
                        {isOwner && job.status === 'OPEN' && (
                          <>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red-400)' }}
                              onClick={() => handleCancelJob(String(job.id))}
                              disabled={txState.status === 'pending'}
                            >
                              {txState.status === 'pending'
                                ? 'Đang chờ đồng thuận...'
                                : 'Cancel Job & Refund'
                              }
                            </button>

                            {job.applicants && job.applicants.length > 0 && (
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                                <select
                                  className="form-input"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', minWidth: '150px' }}
                                  value={selectedWinner[job.id] || ''}
                                  onChange={(e) => setSelectedWinner({ ...selectedWinner, [job.id]: e.target.value })}
                                >
                                  <option value="">Select Winner...</option>
                                  {job.applicants.map((app: string) => (
                                    <option key={app} value={app}>
                                      {app.slice(0, 8)}...{app.slice(-6)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleAwardJob(String(job.id))}
                                  disabled={txState.status === 'pending' || !selectedWinner[job.id]}
                                >
                                  {txState.status === 'pending'
                                    ? 'Đang chờ đồng thuận...'
                                    : 'Award Bounty'
                                  }
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {/* Candidate Actions */}
                        {!isOwner && job.status === 'OPEN' && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleApplyJob(String(job.id))}
                            disabled={
                              txState.status === 'pending' ||
                              !callerAddress ||
                              job.applicants?.some((app: string) => app.toLowerCase() === callerAddress.toLowerCase())
                            }
                          >
                            {txState.status === 'pending'
                              ? 'Đang chờ đồng thuận...'
                              : job.applicants?.some((app: string) => app.toLowerCase() === callerAddress.toLowerCase())
                                ? '✓ Applied'
                                : 'Apply to Bounty'
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

