interface SkillBadgeProps {
  skill: string;
  type: 'verified' | 'unverified' | 'partial' | 'neutral';
}

const ICONS = {
  verified: '✓',
  unverified: '✗',
  partial: '~',
  neutral: '◦',
};

export function SkillBadge({ skill, type }: SkillBadgeProps) {
  return (
    <span className={`skill-badge ${type}`} title={`${skill}: ${type}`}>
      <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{ICONS[type]}</span>
      {skill}
    </span>
  );
}
