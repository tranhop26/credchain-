import { NavLink } from 'react-router-dom';

interface NavbarProps {
  contractAddress: string;
}

export function Navbar({ contractAddress }: NavbarProps) {
  const short = contractAddress
    ? `${contractAddress.slice(0, 6)}…${contractAddress.slice(-4)}`
    : 'Not deployed';

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
            to="/profile/0x0000000000000000000000000000000000000000"
            id="nav-profile"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Profile
          </NavLink>
        </div>

        <div className="navbar-badge">
          <div className="status-dot" />
          <span>{short}</span>
        </div>
      </div>
    </nav>
  );
}
