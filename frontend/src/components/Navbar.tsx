import { NavLink } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';

interface NavbarProps {
  contractAddress: string;
}

export function Navbar({ contractAddress }: NavbarProps) {
  const { address, isConnected, connect, disconnect } = useWallet();

  const shortContract = contractAddress
    ? `${contractAddress.slice(0, 6)}…${contractAddress.slice(-4)}`
    : 'Not deployed';

  const shortWallet = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-brand">
          <div className="navbar-logo">C</div>
          <div>
            <div className="navbar-name">CredChain</div>
            <div className="navbar-tagline">Decentralized CV Verification</div>
          </div>
        </NavLink>

        <div className="navbar-nav">
          <NavLink
            to="/candidate"
            id="nav-candidate"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Candidate
          </NavLink>
          <NavLink
            to="/employer"
            id="nav-employer"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Employer
          </NavLink>
          <NavLink
            to={address ? `/profile/${address}` : '/profile/0x0000000000000000000000000000000000000000'}
            id="nav-profile"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            My Profile
          </NavLink>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="navbar-badge">
            <div className="status-dot" />
            <span>{shortContract}</span>
          </div>

          {isConnected ? (
            <button
              id="btn-disconnect-wallet"
              onClick={disconnect}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '6px 12px',
              }}
            >
              {shortWallet} ✓
            </button>
          ) : (
            <button
              id="btn-connect-wallet"
              onClick={connect}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                padding: '6px 14px',
              }}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
