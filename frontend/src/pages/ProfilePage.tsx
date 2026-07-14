import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VerificationResultCard } from '../components/VerificationResult';
import { SkillBadge } from '../components/SkillBadge';
import { useCredChain, type CandidateProfile, type VerificationResult } from '../hooks/useCredChain';

export function ProfilePage() {
  const { address: routeAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const { getCandidateFullState } = useCredChain();

  const [searchAddr, setSearchAddr] = useState(routeAddress || '');
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [stake, setStake] = useState<number>(0);
  const [blacklisted, setBlacklisted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  // v2 fields
  const [reputation, setReputation] = useState<number>(0);
  const [tier, setTier] = useState<string>('NONE');
  const [interviewScore, setInterviewScore] = useState<number>(0);
  const [interviewStatus, setInterviewStatus] = useState<string>('NOT_STARTED');

  const loadProfile = async (addr: string) => {
    if (!addr.trim() || addr === '0x0000000000000000000000000000000000000000') return;
    setIsLoading(true);
    setSearched(true);
    setErrorState(null);
    try {
      const state = await getCandidateFullState(addr);
      if (state) {
        const p = state.profile ? JSON.parse(state.profile) : null;
        setProfile(p);
        if (p) {
          const r = state.verification_result ? JSON.parse(state.verification_result) : null;
          setResult(r);
          setStake(state.stake);
          setBlacklisted(state.blacklist);
          setReputation(state.reputation);
          setTier(state.tier);
          setInterviewScore(state.interview_score);
          setInterviewStatus(state.interview_status);
        }
      } else {
        setProfile(null);
        setResult(null);
        setStake(0);
        setBlacklisted(false);
        setReputation(0);
        setTier('NONE');
        setInterviewScore(0);
        setInterviewStatus('NOT_STARTED');
      }
    } catch (err: any) {
      console.error('[ProfilePage] loadProfile failed:', err);
      const msg = err.message || err.details || String(err);
      setErrorState(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (routeAddress && routeAddress !== '0x0000000000000000000000000000000000000000') {
      loadProfile(routeAddress);
    }
  }, [routeAddress]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/profile/${searchAddr.trim()}`);
    loadProfile(searchAddr.trim());
  };

  const statusColor = (s?: string) => {
    if (s === 'VERIFIED') return 'var(--green-400)';
    if (s === 'PARTIAL') return 'var(--yellow-400)';
    if (s === 'BLACKLISTED' || blacklisted) return 'var(--red-400)';
    return 'var(--purple-400)';
  };

  const tierColor = (t: string) => {
    if (t === 'BRONZE') return '#b45309';
    if (t === 'SILVER') return '#94a3b8';
    if (t === 'GOLD') return '#fbbf24';
    if (t === 'PLATINUM') return '#38bdf8';
    return 'var(--text-muted)';
  };

  return (
    <div className="page-content fade-in">
      {/* Hero */}
      <div className="hero">
        <div className="hero-badge">Public Profile</div>
        <h1 className="hero-title">On-Chain Credential<br />Verification</h1>
        <p className="hero-desc">
          View any candidate's tamper-proof skill verification, reputation levels,
          and AI interview results committed permanently on GenLayer.
        </p>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: '1.5rem' }} id="profile-search-card">
        <div className="card-header">
          <div className="card-icon purple">🔍</div>
          <div>
            <div className="card-title">Search Candidate Profile</div>
            <div className="card-subtitle">Enter any registered wallet address</div>
          </div>
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            id="field-profile-address"
            className="form-input"
            type="text"
            placeholder="0x..."
            value={searchAddr}
            onChange={e => setSearchAddr(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button
            id="btn-profile-search"
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'View Profile'}
          </button>
        </form>
      </div>

      {errorState && (
        <div className="error-alert fade-in" style={{ marginBottom: '1.5rem' }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>Read/Sync Error: {errorState}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="card fade-in" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="tx-spinner" style={{ margin: '0 auto 1rem', width: 32, height: 32, borderWidth: 3 }} />
          <div style={{ color: 'var(--text-secondary)' }}>Reading on-chain state...</div>
        </div>
      )}

      {/* Not found */}
      {searched && !isLoading && !profile && !errorState && (
        <div className="card fade-in">
          <div className="empty-state">
            <div className="empty-state-icon">🔎</div>
            <div>No profile found for this address.</div>
            <div style={{ marginTop: '0.4rem', fontSize: '0.8125rem' }}>
              This address has not registered as a CredChain candidate.
            </div>
          </div>
        </div>
      )}

      {/* Profile */}
      {profile && !isLoading && (
        <div className="fade-in">
          {/* Blacklist warning */}
          {blacklisted && (
            <div className="error-alert" style={{ marginBottom: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12 }}>
              <span style={{ fontSize: '1.25rem' }}>🚫</span>
              <div>
                <strong>Candidate Blacklisted</strong><br />
                This candidate's bond was slashed due to detected fraud. Their credentials are invalidated.
              </div>
            </div>
          )}

          {/* Profile Card */}
          <div className="card" style={{ marginBottom: '1rem' }} id="public-profile-card">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="card-header" style={{ margin: 0 }}>
                <div className="card-icon cyan">👤</div>
                <div>
                  <div className="card-title" id="profile-name">{profile.name}</div>
                  <div className="card-subtitle">
                    Registered {profile.registered_at > 0 ? new Date(profile.registered_at * 1000).toLocaleDateString() : 'Just now'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span
                  className="badge"
                  style={{
                    color: tierColor(tier),
                    borderColor: tierColor(tier) + '40',
                    background: tierColor(tier) + '10',
                    border: '1px solid',
                    padding: '0.25rem 0.75rem',
                    borderRadius: 4,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                  title={`Staking Tier: ${tier}`}
                >
                  🏆 {tier} TIER
                </span>
                <span
                  className="verdict-badge"
                  style={{
                    color: statusColor(profile.status),
                    borderColor: statusColor(profile.status) + '50',
                    background: statusColor(profile.status) + '15',
                  }}
                  id="profile-status"
                >
                  {blacklisted ? 'BLACKLISTED' : profile.status}
                </span>
              </div>
            </div>

            {/* Skills */}
            <div className="section-label">Claimed Skills</div>
            <div className="badge-list" style={{ marginBottom: '1.25rem' }} id="profile-skills">
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

            <hr className="divider" style={{ border: '0', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

            <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Address</span>
              <span className="info-val" style={{ fontFamily: 'monospace' }}>{routeAddress}</span>
            </div>
            <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Bond Stake</span>
              <span className="info-val" style={{ fontWeight: 600 }}>{stake > 0 ? stake.toLocaleString() + ' GEN' : blacklisted ? 'Slashed' : '—'}</span>
            </div>
            <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Reputation Score</span>
              <span className="info-val" style={{ fontWeight: 600, color: 'var(--green-400)' }}>{reputation}/100</span>
            </div>
            <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              <span className="info-key" style={{ color: 'var(--text-secondary)' }}>GitHub</span>
              <a href={profile.github_url} target="_blank" rel="noreferrer" className="tx-hash-link" style={{ color: 'var(--cyan-400)', textDecoration: 'none' }}>
                {profile.github_url} ↗
              </a>
            </div>
            {profile.portfolio_url && (
              <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Portfolio</span>
                <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="tx-hash-link" style={{ color: 'var(--cyan-400)', textDecoration: 'none' }}>
                  {profile.portfolio_url} ↗
                </a>
              </div>
            )}
            {profile.leetcode_user && (
              <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                <span className="info-key" style={{ color: 'var(--text-secondary)' }}>LeetCode Profile</span>
                <a href={`https://leetcode.com/${profile.leetcode_user}`} target="_blank" rel="noreferrer" className="tx-hash-link" style={{ color: 'var(--cyan-400)', textDecoration: 'none' }}>
                  leetcode.com/{profile.leetcode_user} ↗
                </a>
              </div>
            )}
            {profile.stackoverflow_id && (
              <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                <span className="info-key" style={{ color: 'var(--text-secondary)' }}>StackOverflow Profile</span>
                <a href={`https://stackoverflow.com/users/${profile.stackoverflow_id}`} target="_blank" rel="noreferrer" className="tx-hash-link" style={{ color: 'var(--cyan-400)', textDecoration: 'none' }}>
                  stackoverflow.com/users/{profile.stackoverflow_id} ↗
                </a>
              </div>
            )}
            {profile.cv_url && (
              <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Resume / CV</span>
                <a href={profile.cv_url} target="_blank" rel="noreferrer" className="tx-hash-link" style={{ color: 'var(--cyan-400)', textDecoration: 'none' }}>
                  Open Document ↗
                </a>
              </div>
            )}
          </div>

          {/* AI Interview Grade Panel */}
          {interviewStatus !== 'NOT_STARTED' && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.95rem' }}>AI Technical Interview Performance</strong>
                <span
                  className="verdict-badge"
                  style={{
                    color: statusColor(interviewStatus === 'GRADED' ? 'VERIFIED' : 'PENDING'),
                    borderColor: statusColor(interviewStatus === 'GRADED' ? 'VERIFIED' : 'PENDING') + '50',
                    background: statusColor(interviewStatus === 'GRADED' ? 'VERIFIED' : 'PENDING') + '15',
                  }}
                >
                  {interviewStatus}
                </span>
              </div>
              {interviewStatus === 'GRADED' && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                  Score: <strong style={{ color: 'var(--green-400)', fontSize: '1.25rem' }}>{interviewScore}/100</strong>
                </div>
              )}
              {interviewStatus === 'NEEDS_REVIEW' && (
                <div style={{ marginTop: '0.75rem', color: 'var(--red-400)', fontSize: '0.85rem' }}>
                  ⚠ Consensus Deviation Detected: AI validator grades differed widely (&gt;10 pts). Status marked as NEEDS_REVIEW.
                </div>
              )}
            </div>
          )}

          {/* Verification Result */}
          <VerificationResultCard result={result} profile={profile} isLoading={false} />
        </div>
      )}
    </div>
  );
}

