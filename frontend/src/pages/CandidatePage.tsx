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
    registerCandidateExtended, stake, unstake,
    generateInterviewQuestions, submitInterviewAnswers, gradeInterview,
    submitAppeal, executeAppeal,
    getCandidateProfile, getCandidateFullState,
    callerAddress,
  } = useCredChain();

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [stakeAmount, setStakeAmount] = useState<number>(0);
  const [reputation, setReputation] = useState<number>(0);
  const [tier, setTier] = useState<string>('NONE');

  const [interviewStatus, setInterviewStatus] = useState<string>('NOT_STARTED');
  const [interviewQuestions, setInterviewQuestions] = useState<string[]>([]);
  const [interviewAnswers, setInterviewAnswers] = useState<string[]>([]);
  const [interviewScore, setInterviewScore] = useState<number>(0);

  const [appeal, setAppeal] = useState<any>(null);
  const [appealUsed, setAppealUsed] = useState<boolean>(false);

  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'register' | 'status' | 'staking' | 'interview' | 'appeal'>('register');
  const [errorState, setErrorState] = useState<string | null>(null);

  // Inputs state
  const [answersInput, setAnswersInput] = useState<string[]>([]);
  const [stakeInput, setStakeInput] = useState('');
  const [unstakeInput, setUnstakeInput] = useState('');
  const [appealReasoning, setAppealReasoning] = useState('');

  const refreshProfile = useCallback(async () => {
    if (!callerAddress) return;
    setIsLoadingProfile(true);
    setErrorState(null);
    try {
      const state = await getCandidateFullState(callerAddress);
      if (state) {
        const p = state.profile ? JSON.parse(state.profile) : null;
        setProfile(p);
        
        if (p) {
          const r = state.verification_result ? JSON.parse(state.verification_result) : null;
          setResult(r);
          setStakeAmount(state.stake);
          setReputation(state.reputation);
          setTier(state.tier);
          setInterviewStatus(state.interview_status);
          
          const q = state.interview_questions ? JSON.parse(state.interview_questions) : [];
          setInterviewQuestions(q);
          
          const a = state.interview_answers ? JSON.parse(state.interview_answers) : [];
          setInterviewAnswers(a);
          
          setInterviewScore(state.interview_score);
          
          const ap = state.appeal ? JSON.parse(state.appeal) : null;
          setAppeal(ap);
          
          setAppealUsed(state.appeal_used);

          // Pre-fill answers inputs if questions are loaded but no answers yet
          if (q && q.length > 0 && answersInput.length === 0) {
            setAnswersInput(new Array(q.length).fill(''));
          }
        }
      } else {
        setProfile(null);
        setResult(null);
        setStakeAmount(0);
        setReputation(0);
        setTier('NONE');
        setInterviewStatus('NOT_STARTED');
        setInterviewQuestions([]);
        setInterviewAnswers([]);
        setInterviewScore(0);
        setAppeal(null);
        setAppealUsed(false);
      }
    } catch (err: any) {
      console.error('[CandidatePage] refreshProfile error:', err);
      const msg = err.message || err.details || String(err);
      setErrorState(msg);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [callerAddress, getCandidateFullState, answersInput.length]);

  useEffect(() => {
    if (callerAddress) {
      refreshProfile().then(() => {
        // Automatically switch away from 'register' tab if profile is found
        getCandidateProfile(callerAddress).then(p => {
          if (p && p.name) {
            setActiveTab('status');
          }
        });
      });
    }
  }, [callerAddress, getCandidateProfile]);

  const handleRegisterAndStake = async (data: {
    name: string; claimedSkills: string; githubUrl: string;
    portfolioUrl: string; stakeAmount: number;
    leetcodeUser: string; stackoverflowId: string;
    cvUrl: string;
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
      const registerResult = await registerCandidateExtended(
        data.name,
        data.claimedSkills,
        data.githubUrl,
        data.portfolioUrl,
        data.leetcodeUser,
        data.stackoverflowId,
        data.cvUrl
      );
      if (!registerResult.success) return;
      registerSuccess = true;
      registerHash = registerResult.hash || '';
    }

    // 2. Submit stake
    const stakeResult = await stake(data.stakeAmount);
    await refreshProfile();

    if (registerSuccess && stakeResult.success) {
      const displayMsg = `Registration & Staking Complete!\n` +
        (registerHash ? `Registration Tx: ${registerHash}\n` : '') +
        `Staking Tx: ${stakeResult.hash || ''}`;

      succeedTx(stakeResult.hash || registerHash || '', displayMsg);
      setActiveTab('status');
    }
  };

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(stakeInput);
    if (!amount || amount <= 0) return;
    resetTx();
    const res = await stake(amount);
    if (res.success) {
      setStakeInput('');
      await refreshProfile();
    }
  };

  const handleUnstake = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(unstakeInput);
    if (!amount || amount <= 0) return;
    resetTx();
    const res = await unstake(amount);
    if (res.success) {
      setUnstakeInput('');
      await refreshProfile();
    }
  };

  const handleGenerateQuestions = async () => {
    if (!callerAddress) return;
    resetTx();
    const hash = await generateInterviewQuestions(callerAddress);
    if (hash) {
      await refreshProfile();
    }
  };

  const handleSubmitAnswers = async () => {
    if (!callerAddress || answersInput.some(a => !a.trim())) return;
    resetTx();
    const hash = await submitInterviewAnswers(callerAddress, answersInput);
    if (hash) {
      await refreshProfile();
    }
  };

  const handleGradeInterview = async () => {
    if (!callerAddress) return;
    resetTx();
    const hash = await gradeInterview(callerAddress);
    if (hash) {
      await refreshProfile();
    }
  };

  const handleAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealReasoning.trim()) return;
    resetTx();
    const res = await submitAppeal(appealReasoning);
    if (res.success) {
      setAppealReasoning('');
      await refreshProfile();
    }
  };

  const handleExecuteAppeal = async () => {
    if (!callerAddress) return;
    resetTx();
    const hash = await executeAppeal(callerAddress);
    if (hash) {
      await refreshProfile();
    }
  };

  const statusColor = (s?: string) => {
    if (s === 'VERIFIED') return 'var(--green-400)';
    if (s === 'PARTIAL') return 'var(--yellow-400)';
    if (s === 'BLACKLISTED') return 'var(--red-400)';
    return 'var(--purple-400)';
  };

  // Staking Tier Helper
  const getNextTierDetails = () => {
    if (tier === 'BRONZE' || tier === 'NONE') {
      return { next: 'SILVER', stake: 1000, rep: 50 };
    }
    if (tier === 'SILVER') {
      return { next: 'GOLD', stake: 2000, rep: 70 };
    }
    if (tier === 'GOLD') {
      return { next: 'PLATINUM', stake: 5000, rep: 85 };
    }
    return null;
  };

  const nextTier = getNextTierDetails();

  return (
    <div className="page-content fade-in">
      {/* Hero */}
      <div className="hero">
        <div className="hero-badge">Candidate Portal</div>
        <h1 className="hero-title">Build Your On-Chain<br />Skill Credential</h1>
        <p className="hero-desc">
          Register your skills, stake a reputation bond, take AI-generated technical interviews,
          and unlock prestigious staking tiers backed by validator consensus.
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

      {/* Wallet info card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ marginBottom: '0.75rem' }}>
          <div className="card-icon cyan">◎</div>
          <div style={{ flex: 1 }}>
            <div className="card-title">Your Connected Wallet</div>
            <div className="card-subtitle">Active account address</div>
          </div>
          {profile && (
            <span className="verdict-badge" style={{ color: statusColor(profile.status), borderColor: statusColor(profile.status) + '50', background: statusColor(profile.status) + '15' }}>
              {profile.status}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <span className="address-tag" id="caller-address" style={{ fontSize: '0.85rem' }}>{callerAddress || '(Not Connected)'}</span>
          {profile && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--purple-400)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                Tier: {tier}
              </span>
              <span className="badge" style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--cyan-400)', border: '1px solid rgba(34,211,238,0.25)', borderRadius: 4, padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                Rep: {reputation}/100
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="tab-group" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        <button
          id="tab-status"
          className={`tab-btn${activeTab === 'status' ? ' active' : ''}`}
          onClick={() => { setActiveTab('status'); refreshProfile(); }}
        >
          My Profile
        </button>
        <button
          id="tab-register"
          className={`tab-btn${activeTab === 'register' ? ' active' : ''}`}
          onClick={() => setActiveTab('register')}
        >
          Register & Stake
        </button>
        <button
          id="tab-staking"
          className={`tab-btn${activeTab === 'staking' ? ' active' : ''}`}
          onClick={() => { setActiveTab('staking'); refreshProfile(); }}
          disabled={!profile}
        >
          Staking & Tiers
        </button>
        <button
          id="tab-interview"
          className={`tab-btn${activeTab === 'interview' ? ' active' : ''}`}
          onClick={() => { setActiveTab('interview'); refreshProfile(); }}
          disabled={!profile}
        >
          AI Interview
        </button>
        {(profile?.status === 'BLACKLISTED' || appealUsed || appeal) && (
          <button
            id="tab-appeal"
            className={`tab-btn${activeTab === 'appeal' ? ' active' : ''}`}
            onClick={() => { setActiveTab('appeal'); refreshProfile(); }}
          >
            Appeal
          </button>
        )}
      </div>

      {/* Tab: Register */}
      {activeTab === 'register' && (
        <div className="card fade-in">
          {profile ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--green-400)' }}>
                ✓ Profile Registered
              </div>
              <p style={{ color: 'var(--slate-400)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Your candidate profile is successfully registered under the name: <strong>{profile.name}</strong>.
                You can manage your stakes, take interviews, and check status using the other tabs.
              </p>
              <button className="btn btn-secondary" onClick={() => setActiveTab('status')}>
                View My Profile
              </button>
            </div>
          ) : (
            <>
              <div className="card-header">
                <div className="card-icon purple">+</div>
                <div>
                  <div className="card-title">Register as Candidate</div>
                  <div className="card-subtitle">Submit profile details and stake an initial reputation bond</div>
                </div>
              </div>
              <CandidateForm
                onSubmit={handleRegisterAndStake}
                isLoading={txState.status === 'pending' && activeTab === 'register'}
              />
              <TxStatus
                txState={txState}
                consensusMsg="Registering & staking bond on GenLayer network..."
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
              <div className="card" style={{ marginBottom: '1.5rem' }} id="profile-card">
                <div className="card-header">
                  <div className="card-icon green">👤</div>
                  <div style={{ flex: 1 }}>
                    <div className="card-title">{profile.name}</div>
                    <div className="card-subtitle">
                      Registered {profile.registered_at > 0 ? new Date(profile.registered_at * 1000).toLocaleDateString() : 'Just now'}
                    </div>
                  </div>
                </div>

                <div className="section-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Claimed Skills</div>
                <div className="badge-list" id="claimed-skills" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
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
                  <span className="info-key" style={{ color: 'var(--text-secondary)' }}>Staked Balance</span>
                  <strong style={{ color: 'var(--purple-400)' }}>{stakeAmount} GEN</strong>
                </div>

                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  <span className="info-key" style={{ color: 'var(--text-secondary)' }}>GitHub Profile</span>
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
                    <span className="info-key" style={{ color: 'var(--text-secondary)' }}>LeetCode Username</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{profile.leetcode_user}</strong>
                  </div>
                )}

                {profile.stackoverflow_id && (
                  <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                    <span className="info-key" style={{ color: 'var(--text-secondary)' }}>StackOverflow ID</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{profile.stackoverflow_id}</strong>
                  </div>
                )}

                {profile.cv_url && (
                  <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                    <span className="info-key" style={{ color: 'var(--text-secondary)' }}>CV Link</span>
                    <a href={profile.cv_url} target="_blank" rel="noreferrer" className="tx-hash-link" style={{ color: 'var(--cyan-400)', textDecoration: 'none' }}>
                      Open Resume ↗
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
              <div className="empty-state" style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div className="empty-state-icon" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📋</div>
                <div style={{ fontWeight: 600 }}>Not registered yet</div>
                <div style={{ marginTop: '0.4rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
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

      {/* Tab: Staking */}
      {activeTab === 'staking' && profile && (
        <div className="fade-in">
          {/* Staking Widget */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <div className="card-icon purple">💰</div>
              <div>
                <div className="card-title">Reputation Bond Staking</div>
                <div className="card-subtitle">Manage your staked GEN balance to climb candidate tiers</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Staked Balance</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--purple-400)' }}>{stakeAmount} GEN</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Current Tier</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--cyan-400)' }}>{tier}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Reputation Score</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--green-400)' }}>{reputation}/100</div>
              </div>
            </div>

            {/* Tier progression */}
            {nextTier ? (
              <div style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                🚀 <strong>Progression to {nextTier.next} Tier:</strong><br />
                - Requires at least <strong>{nextTier.stake} GEN</strong> staked (Needs {Math.max(0, nextTier.stake - stakeAmount)} GEN more)<br />
                - Requires a reputation score of <strong>{nextTier.rep}</strong> or higher (Current reputation: {reputation})
              </div>
            ) : (
              <div style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--green-400)' }}>
                🏆 <strong>Max Tier reached!</strong> You are at the top PLATINUM level.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              {/* Stake Form */}
              <form onSubmit={handleStake} style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Stake Additional GEN</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="GEN amount"
                    value={stakeInput}
                    onChange={e => setStakeInput(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={txState.status === 'pending'}
                >
                  Deposit Stake
                </button>
              </form>

              {/* Unstake Form */}
              <form onSubmit={handleUnstake}>
                <div className="form-group">
                  <label className="form-label">Unstake GEN</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="GEN amount"
                    value={unstakeInput}
                    onChange={e => setUnstakeInput(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                  disabled={txState.status === 'pending' || stakeAmount <= 0}
                >
                  Unstake GEN
                </button>
              </form>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <TxStatus txState={txState} consensusMsg="Processing stake transaction..." />
            </div>
          </div>

          {/* Staking rules breakdown */}
          <div className="card-glass">
            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Staking Tiers Summary:</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Tier</th>
                  <th style={{ padding: '0.5rem' }}>Required Stake</th>
                  <th style={{ padding: '0.5rem' }}>Required Reputation</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>BRONZE</td>
                  <td style={{ padding: '0.5rem' }}>500 GEN</td>
                  <td style={{ padding: '0.5rem' }}>0 (Default)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--purple-400)' }}>SILVER</td>
                  <td style={{ padding: '0.5rem' }}>1,000 GEN</td>
                  <td style={{ padding: '0.5rem' }}>≥ 50</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--cyan-400)' }}>GOLD</td>
                  <td style={{ padding: '0.5rem' }}>2,000 GEN</td>
                  <td style={{ padding: '0.5rem' }}>≥ 70</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--yellow-400)' }}>PLATINUM</td>
                  <td style={{ padding: '0.5rem' }}>5,000 GEN</td>
                  <td style={{ padding: '0.5rem' }}>≥ 85</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: AI Interview */}
      {activeTab === 'interview' && profile && (
        <div className="card fade-in">
          <div className="card-header">
            <div className="card-icon cyan">🤖</div>
            <div>
              <div className="card-title">AI Technical Interview</div>
              <div className="card-subtitle">Take an automated interview graded by AI validators to build your reputation score</div>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Interview Status:</span>
              <strong style={{ color: statusColor(interviewStatus) === 'var(--purple-400)' ? 'var(--cyan-400)' : statusColor(interviewStatus) }}>
                {interviewStatus}
              </strong>
            </div>
            {interviewStatus === 'GRADED' && (
              <div style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '1rem', fontSize: '0.9rem' }}>
                🎉 <strong>Grading Finished!</strong><br />
                You scored <strong>{interviewScore}/100</strong>. Your reputation score has been updated to match your interview grade.
              </div>
            )}

            {interviewStatus === 'NEEDS_REVIEW' && (
              <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '1rem', fontSize: '0.9rem', color: 'var(--red-400)' }}>
                ⚠ <strong>Consensus Deviation Warning!</strong><br />
                The validators returned widely differing grades (&gt;10 points difference).
                This interview requires validator review. You can trigger a new grade run.
              </div>
            )}
          </div>

          {/* Flow 1: Generate Questions */}
          {interviewStatus === 'NOT_STARTED' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                You have not started your AI interview. Clicking below will generate a set of custom questions
                based on your claimed skills ({profile.claimed_skills}) using GenVM's AI nodes.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleGenerateQuestions}
                disabled={txState.status === 'pending'}
              >
                Generate AI Interview Questions
              </button>
            </div>
          )}

          {/* Flow 2: Answer Questions */}
          {(interviewStatus === 'GENERATED' || (interviewStatus === 'ANSWERED' && interviewQuestions.length > 0)) && (
            <div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                💡 <strong>Instructions:</strong> Answer each question carefully. Once submitted, your answers will be stored on-chain and AI validators will grade them.
              </div>

              {interviewQuestions.map((q, idx) => (
                <div key={idx} className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Question {idx + 1}: {q}</label>
                  {interviewStatus === 'GENERATED' ? (
                    <textarea
                      className="form-input"
                      style={{ minHeight: '100px', resize: 'vertical' }}
                      placeholder="Type your technical answer here..."
                      value={answersInput[idx] || ''}
                      onChange={e => {
                        const newAns = [...answersInput];
                        newAns[idx] = e.target.value;
                        setAnswersInput(newAns);
                      }}
                    />
                  ) : (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {interviewAnswers[idx] || '(No answer provided)'}
                    </div>
                  )}
                </div>
              ))}

              {interviewStatus === 'GENERATED' && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={handleSubmitAnswers}
                  disabled={txState.status === 'pending' || answersInput.some(a => !a.trim())}
                >
                  Submit Interview Answers
                </button>
              )}
            </div>
          )}

          {/* Flow 3: Grade Interview */}
          {(interviewStatus === 'ANSWERED' || interviewStatus === 'NEEDS_REVIEW') && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Your answers are ready for review. Trigger AI validator consensus to grade your answers.
              </p>
              <button
                className="btn btn-cyan"
                onClick={handleGradeInterview}
                disabled={txState.status === 'pending'}
              >
                Grade My Answers (Consensus Run)
              </button>
            </div>
          )}

          {/* Flow 4: Graded Results */}
          {interviewStatus === 'GRADED' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Your Graded Submission</div>
              {interviewQuestions.map((q, idx) => (
                <div key={idx} style={{ marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Q{idx + 1}: {q}</div>
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
                    Ans: {interviewAnswers[idx]}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <TxStatus txState={txState} consensusMsg="Executing AI validators consensus... (30-60 seconds)" />
          </div>
        </div>
      )}

      {/* Tab: Appeal */}
      {activeTab === 'appeal' && (
        <div className="card fade-in">
          <div className="card-header">
            <div className="card-icon red">⚠</div>
            <div>
              <div className="card-title">Submit Credential Appeal</div>
              <div className="card-subtitle">Dispute a bad validation result or slash verdict using advanced AI validator review</div>
            </div>
          </div>

          <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            <strong>Economics & Safety:</strong><br />
            - Submitting an appeal requires locking a fee of <strong>100 GEN</strong>.<br />
            - If your appeal is <strong>WON</strong>: your fee is refunded and any slashed status is cleared.<br />
            - If your appeal is <strong>LOST</strong>: the 100 GEN fee is permanently burned to prevent spam.<br />
            - <strong>Limit:</strong> Exactly <strong>1 appeal</strong> per verdict is permitted.
          </div>

          {appeal && (
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Active Appeal Status:</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <strong style={{ color: appeal.status === 'WON' ? 'var(--green-400)' : appeal.status === 'LOST' ? 'var(--red-400)' : 'var(--yellow-400)' }}>
                  {appeal.status}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Reasoning:</span>
                <span style={{ color: 'var(--text-primary)' }}>{appeal.reasoning}</span>
              </div>

              {appeal.status === 'PENDING' && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '1rem', paddingTop: '1rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    As a developer testing on Studionet, you can manually trigger validators to process this pending appeal.
                  </p>
                  <button
                    className="btn btn-cyan btn-sm"
                    onClick={handleExecuteAppeal}
                    disabled={txState.status === 'pending'}
                  >
                    Execute Appeal Verdict (Consensus Run)
                  </button>
                </div>
              )}
            </div>
          )}

          {!appealUsed && !appeal && (
            <form onSubmit={handleAppeal}>
              <div className="form-group">
                <label className="form-label" htmlFor="field-appeal-reasoning">Justification / Appeal Reason</label>
                <textarea
                  id="field-appeal-reasoning"
                  className="form-input"
                  style={{ minHeight: '120px', resize: 'vertical' }}
                  placeholder="Provide evidence or justify why your skills verification is correct (e.g. specific repos, commits, projects)..."
                  value={appealReasoning}
                  onChange={e => setAppealReasoning(e.target.value)}
                  required
                />
              </div>

              <button
                id="btn-submit-appeal"
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', background: 'linear-gradient(135deg, var(--red-500), #dc2626)', boxShadow: '0 2px 16px rgba(239, 68, 68, 0.35)' }}
                disabled={txState.status === 'pending' || !appealReasoning.trim()}
              >
                Submit Appeal (Pay 100 GEN)
              </button>
            </form>
          )}

          {appealUsed && !appeal && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--red-400)', fontWeight: 600 }}>
              🚫 Appeal used. You have already exhausted your appeal allocation.
            </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <TxStatus txState={txState} consensusMsg="Validators are reviewing appeal evidence... (30-60 seconds)" />
          </div>
        </div>
      )}
    </div>
  );
}

