import { useState, useEffect, useCallback } from 'react';
import { CandidateForm } from '../components/CandidateForm';
import { TxStatus } from '../components/TxStatus';
import { VerificationResultCard } from '../components/VerificationResult';
import { SkillBadge } from '../components/SkillBadge';
import { useCredChain, type CandidateProfile, type VerificationResult } from '../hooks/useCredChain';

export function CandidatePage() {
  const {
    txState, resetTx,
    registerCandidate, stakeBond,
    getCandidateProfile, getVerificationResult,
    callerAddress,
  } = useCredChain();

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'register' | 'status'>('register');

  const refreshProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      const [p, r] = await Promise.all([
        getCandidateProfile(callerAddress),
        getVerificationResult(callerAddress),
      ]);
      setProfile(p);
      setResult(r);
      if (p) setActiveTab('status');
    } finally {
      setIsLoadingProfile(false);
    }
  }, [callerAddress, getCandidateProfile, getVerificationResult]);

  useEffect(() => { refreshProfile(); }, [refreshProfile]);

  const handleRegisterAndStake = async (data: {
    name: string; claimedSkills: string; githubUrl: string;
    portfolioUrl: string; stakeAmount: number;
  }) => {
    resetTx();
    await registerCandidate(data.name, data.claimedSkills, data.githubUrl, data.portfolioUrl);
    if (txState.status !== 'error') {
      await stakeBond(data.stakeAmount);
    }
    await refreshProfile();
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
