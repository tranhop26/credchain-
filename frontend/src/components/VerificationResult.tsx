import { SkillBadge } from './SkillBadge';
import type { VerificationResult, CandidateProfile } from '../hooks/useCredChain';

interface VerificationResultProps {
  result: VerificationResult | null;
  profile: CandidateProfile | null;
  isLoading?: boolean;
}

const VERDICT_ICONS = {
  VERIFIED: '🛡',
  PARTIAL: '⚡',
  UNVERIFIED: '✗',
};

const VERDICT_LABELS = {
  VERIFIED: 'Skills Verified',
  PARTIAL: 'Partially Verified',
  UNVERIFIED: 'Not Verified',
};

function ConfidenceMeter({ value }: { value: number }) {
  const tier = value >= 70 ? 'high' : value >= 40 ? 'medium' : 'low';
  return (
    <div className="confidence-bar-wrap">
      <div className="confidence-label">
        <span>AI Confidence</span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value}%</span>
      </div>
      <div className="confidence-bar-bg">
        <div
          className={`confidence-bar-fill ${tier}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function VerificationResultCard({ result, isLoading }: Omit<VerificationResultProps, 'profile'> & { profile?: CandidateProfile | null }) {
  if (isLoading) {
    return (
      <div className="card fade-in">
        <div className="skeleton" style={{ height: 24, width: '60%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 80 }} />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card fade-in">
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div>No verification result yet.</div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.8125rem' }}>
            Complete the verification flow to see the AI verdict here.
          </div>
        </div>
      </div>
    );
  }

  const verdict = result.verdict;
  const verifiedAt = result.verified_at
    ? new Date(result.verified_at * 1000).toLocaleString()
    : 'Unknown';

  return (
    <div className="card fade-in" id="verification-result">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="card-header" style={{ margin: 0 }}>
          <div className={`card-icon ${verdict === 'VERIFIED' ? 'green' : verdict === 'PARTIAL' ? 'purple' : 'red'}`}>
            {VERDICT_ICONS[verdict] || '?'}
          </div>
          <div>
            <div className="card-title">Verification Result</div>
            <div className="card-subtitle">Verified at {verifiedAt}</div>
          </div>
        </div>
        <span className={`verdict-badge ${verdict}`} id="verdict-badge">
          {VERDICT_LABELS[verdict] || verdict}
        </span>
      </div>

      {/* Confidence Meter */}
      <ConfidenceMeter value={result.confidence} />

      <hr className="divider" />

      {/* Skill Breakdown */}
      {result.verified_skills?.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div className="section-label">Verified Skills</div>
          <div className="badge-list" id="verified-skills">
            {result.verified_skills.map(s => (
              <SkillBadge key={s} skill={s} type="verified" />
            ))}
          </div>
        </div>
      )}

      {result.unverified_skills?.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div className="section-label">Unverified Skills</div>
          <div className="badge-list" id="unverified-skills">
            {result.unverified_skills.map(s => (
              <SkillBadge key={s} skill={s} type="unverified" />
            ))}
          </div>
        </div>
      )}

      {/* AI Reasoning — the key proof AI ran on-chain */}
      {result.reasoning && (
        <div>
          <div className="section-label">AI Reasoning</div>
          <div className="reasoning-box" id="ai-reasoning">
            <div className="reasoning-label">On-chain AI verdict explanation</div>
            {result.reasoning}
          </div>
        </div>
      )}

      {/* Fraud warning */}
      {result.fraud_detected && (
        <div className="error-alert" style={{ marginTop: '1rem' }}>
          <span>⚠</span>
          <span>
            <strong>Fraud Detected:</strong> Evidence actively contradicts claimed skills. Bond has been slashed and candidate is blacklisted.
          </span>
        </div>
      )}

      {/* Evidence note for auto-UNVERIFIED */}
      {result.evidence_note === 'auto_unverified_no_sources' && (
        <div className="tx-status" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', marginTop: '0.75rem' }}>
          <span style={{ fontSize: '1rem' }}>ℹ</span>
          <div className="tx-status-text">
            <div className="tx-status-title" style={{ color: 'var(--yellow-400)' }}>Evidence Inaccessible</div>
            <div className="tx-status-sub">GitHub and portfolio URLs were unreadable at verification time.</div>
          </div>
        </div>
      )}

      {/* Request ID */}
      {result.request_id !== undefined && (
        <div style={{ marginTop: '1rem' }}>
          <div className="info-row">
            <span className="info-key">Request ID</span>
            <span className="info-val">{result.request_id}</span>
          </div>
        </div>
      )}
    </div>
  );
}
