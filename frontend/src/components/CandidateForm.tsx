import { useState } from 'react';
import { useWallet } from '../context/WalletContext';

interface CandidateFormProps {
  onSubmit: (data: {
    name: string;
    claimedSkills: string;
    githubUrl: string;
    portfolioUrl: string;
    stakeAmount: number;
  }) => Promise<void>;
  isLoading: boolean;
}

export function CandidateForm({ onSubmit, isLoading }: CandidateFormProps) {
  const { isConnected } = useWallet();
  const [name, setName] = useState('');
  const [skills, setSkills] = useState('');
  const [github, setGithub] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [stake, setStake] = useState('1000');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name,
      claimedSkills: skills,
      githubUrl: github,
      portfolioUrl: portfolio,
      stakeAmount: parseInt(stake) || 1000,
    });
  };

  return (
    <form onSubmit={handleSubmit} id="candidate-registration-form">
      <div className="form-group">
        <label className="form-label" htmlFor="field-name">Full Name</label>
        <input
          id="field-name"
          className="form-input"
          type="text"
          placeholder="Nguyen Van A"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="field-skills">Claimed Skills</label>
        <input
          id="field-skills"
          className="form-input"
          type="text"
          placeholder="Python, React, Solidity, Docker"
          value={skills}
          onChange={e => setSkills(e.target.value)}
          required
        />
        <div className="form-hint">Comma-separated list of skills you claim</div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="field-github">GitHub Profile URL</label>
        <input
          id="field-github"
          className="form-input"
          type="url"
          placeholder="https://github.com/yourusername"
          value={github}
          onChange={e => setGithub(e.target.value)}
          required
        />
        <div className="form-hint">The AI will read this URL on-chain to find evidence of your skills</div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="field-portfolio">Portfolio URL (optional)</label>
        <input
          id="field-portfolio"
          className="form-input"
          type="url"
          placeholder="https://yourportfolio.dev"
          value={portfolio}
          onChange={e => setPortfolio(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="field-stake">Bond Stake Amount</label>
        <input
          id="field-stake"
          className="form-input"
          type="number"
          min="1"
          placeholder="1000"
          value={stake}
          onChange={e => setStake(e.target.value)}
          required
        />
        <div className="form-hint">Reputation bond — forfeited if fraud is detected</div>
      </div>

      <button
        id="btn-register-stake"
        type="submit"
        className="btn btn-primary btn-full"
        disabled={isLoading || !isConnected}
        style={{ marginTop: '0.5rem' }}
      >
        {isLoading ? (
          <>
            <span className="tx-spinner" style={{ width: 16, height: 16 }} />
            Registering on GenLayer...
          </>
        ) : !isConnected ? (
          'Please Connect Wallet'
        ) : (
          '⛓ Register & Stake Bond'
        )}
      </button>
    </form>
  );
}
