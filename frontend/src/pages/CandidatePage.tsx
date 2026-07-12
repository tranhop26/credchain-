import { useState, useEffect, useCallback } from 'react';
import { CandidateForm } from '../components/CandidateForm';
import { TxStatus } from '../components/TxStatus';
import { VerificationResultCard } from '../components/VerificationResult';
import { SkillBadge } from '../components/SkillBadge';
import { useCredChain, type CandidateProfile, type VerificationResult } from '../hooks/useCredChain';

import { useWallet } from '../context/WalletContext';

export function CandidatePage() {
  const { error: walletError } = useWallet();
  const {
    txState, resetTx, succeedTx,
    registerCandidate, stakeBond,
    getCandidateProfile, getVerificationResult, getStake,
    callerAddress,
  } = useCredChain();

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [stakeAmount, setStakeAmount] = useState<number>(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'register' | 'status'>('register');

  const refreshProfile = useCallback(async () => {
    if (!callerAddress) return;
    setIsLoadingProfile(true);
    try {
      const p = await getCandidateProfile(callerAddress);
      setProfile(p);
      if (p) {
        const [r, s] = await Promise.all([
          getVerificationResult(callerAddress),
          getStake(callerAddress),
        ]);
        setResult(r);
        setStakeAmount(s);
        setActiveTab('status');
      }
    } finally {
      setIsLoadingProfile(false);
    }
  }, [callerAddress, getCandidateProfile, getVerificationResult, getStake]);

  useEffect(() => { refreshProfile(); }, [refreshProfile]);

  const handleContinueStakingOnly = async () => {
    resetTx();
    const stakeResult = await stakeBond(1000);
    if (stakeResult.success) {
      await refreshProfile();
      succeedTx(stakeResult.hash || '', `Bond staked successfully! Tx Hash: ${stakeResult.hash || ''}`);
    }
  };

  const handleRegisterAndStake = async (data: {
    name: string; claimedSkills: string; githubUrl: string;
    portfolioUrl: string; stakeAmount: number;
  }) => {
    resetTx();

    let registerSuccess = false;
    let registerHash = '';

    // 1. Prevent duplicate registration: check getCandidateProfile
    if (callerAddress) {
      const existingProfile = await getCandidateProfile(callerAddress);
      if (existingProfile && existingProfile.name) {
        registerSuccess = true;
        console.log('[CandidatePage] Candidate is already registered. Skipping registration.');
      }
    }

    if (!registerSuccess) {
      const registerResult = await registerCandidate(data.name, data.claimedSkills, data.githubUrl, data.portfolioUrl);
      if (!registerResult.success) return;
      registerSuccess = true;
      registerHash = registerResult.hash || '';

      // Verify candidate profile exists after register_candidate finalized successfully
      if (callerAddress) {
        const verifiedProfile = await getCandidateProfile(callerAddress);
        if (!verifiedProfile || !verifiedProfile.name) {
          console.warn('[CandidatePage] Verified profile check failed or is not updated yet.');
        }
      }
    }

    // 2. Submit stake_bond
    const stakeResult = await stakeBond(data.stakeAmount);
    await refreshProfile();

    // 3. Display both hashes
    if (registerSuccess && stakeResult.success) {
      const displayMsg = `Registration & Staking Complete!\n` +
        (registerHash ? `Registration Tx: ${registerHash}\n` : '') +
        `Staking Tx: ${stakeResult.hash || ''}`;

      succeedTx(stakeResult.hash || registerHash || '', displayMsg);
    }
  };

  const statusColor = (s?: string) => {
    if (s === 'VERIFIED') return 'var(--green-400)';
    if (s === 'PARTIAL') return 'var(--yellow-400)';
    if (s === 'BLACKLISTED') return 'var(--red-400)';
    return 'var(--purple-400)';
  };

  return (
    <div className="page-content fade-in">
      {/* Hero */}
      <div className="hero">
        <div className="hero-badge">Candidate Portal</div>
        <h1 className="hero-title">Build Your On-Chain<br />Skill Credential</h1>
        <p className="hero-desc">
          Register your skills and stake a reputation bond. GenLayer's AI validators
          read your GitHub live on-chain and issue a tamper-proof verification verdict.
        </p>
      </div>

      {walletError && (
        <div className="error-alert fade-in" style={{ marginBottom: '1.5rem' }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>{walletError}</span>
        </div>
      )}

      {/* Your Address */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div className="card-icon cyan">◎</div>
          <div>
            <div className="card-title">Your Wallet</div>
            <div className="card-subtitle">Demo account (ephemeral for testnet)</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <span className="address-tag" id="caller-address">{callerAddress}</span>
          {profile && (
            <span className="verdict-badge" style={{ color: statusColor(profile.status), borderColor: statusColor(profile.status) + '50', background: statusColor(profile.status) + '15' }}>
              {profile.status}
            </span>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="tab-group">
        <button
          id="tab-register"
          className={`tab-btn${activeTab === 'register' ? ' active' : ''}`}
          onClick={() => setActiveTab('register')}
        >
          Register & Stake
        </button>
        <button
          id="tab-status"
          className={`tab-btn${activeTab === 'status' ? ' active' : ''}`}
          onClick={() => { setActiveTab('status'); refreshProfile(); }}
        >
          My Verification Status
        </button>
      </div>

      {/* Tab: Register */}
      {activeTab === 'register' && (
        <div className="card fade-in">
          {profile && stakeAmount === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--yellow-400)' }}>
                ⚠ Registration Succeeded but Staking is Missing
              </div>
              <p style={{ color: 'var(--slate-400)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Your candidate profile was successfully registered, but your reputation bond has not been staked yet.
                Click below to complete the staking process.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                <button
                  id="btn-continue-staking"
                  className="btn btn-primary"
                  onClick={handleContinueStakingOnly}
                  disabled={txState.status === 'pending'}
                >
                  {txState.status === 'pending' ? 'Staking Bond...' : 'Continue Staking Bond (1000 GEN)'}
                </button>
              </div>
              <div style={{ marginTop: '1.5rem' }}>
                <TxStatus
                  txState={txState}
                  consensusMsg="Staking bond on GenLayer network..."
                />
              </div>
            </div>
          ) : (
            <>
              <div className="card-header">
                <div className="card-icon purple">+</div>
                <div>
                  <div className="card-title">Register as Candidate</div>
                  <div className="card-subtitle">Stakes a reputation bond alongside your skill claims</div>
                </div>
              </div>
              <CandidateForm
                onSubmit={handleRegisterAndStake}
                isLoading={txState.status === 'pending'}
              />
              <TxStatus
                txState={txState}
                consensusMsg="Registering on GenLayer network..."
              />
            </>
          )}
        </div>
      )}

      {/* Tab: Status */}
      {activeTab === 'status' && (
        <div className="fade-in">
          {profile ? (
            <>
              {/* Profile Card */}
              <div className="card" style={{ marginBottom: '1rem' }} id="profile-card">
                <div className="card-header">
                  <div className="card-icon green">👤</div>
                  <div>
                    <div className="card-title">{profile.name}</div>
                    <div className="card-subtitle">
                      Registered {new Date(profile.registered_at * 1000).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="section-label">Claimed Skills</div>
                <div className="badge-list" id="claimed-skills">
                  {profile.claimed_skills.split(',').map(s => (
                    <SkillBadge
                      key={s.trim()}
                      skill={s.trim()}
                      type={
                        result?.verified_skills?.includes(s.trim()) ? 'verified' :
                        result?.unverified_skills?.includes(s.trim()) ? 'unverified' :
                        'neutral'
                      }
                    />
                  ))}
                </div>

                <hr className="divider" />

                <div className="info-row">
                  <span className="info-key">GitHub</span>
                  <a href={profile.github_url} target="_blank" rel="noreferrer" className="tx-hash-link">
                    {profile.github_url} ↗
                  </a>
                </div>
                {profile.portfolio_url && (
                  <div className="info-row">
                    <span className="info-key">Portfolio</span>
                    <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="tx-hash-link">
                      {profile.portfolio_url} ↗
                    </a>
                  </div>
                )}
              </div>

              {/* Verification Result */}
              <VerificationResultCard
                result={result}
                profile={profile}
                isLoading={isLoadingProfile}
              />
            </>
          ) : (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div>Not registered yet</div>
                <div style={{ marginTop: '0.4rem', fontSize: '0.8125rem' }}>
                  Switch to the "Register & Stake" tab to get started.
                </div>
              </div>
            </div>
          )}
          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button
              id="btn-refresh"
              className="btn btn-secondary btn-sm"
              onClick={refreshProfile}
              disabled={isLoadingProfile}
            >
              {isLoadingProfile ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
