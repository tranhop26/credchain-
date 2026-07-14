import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import { Navbar } from './components/Navbar';
import { CandidatePage } from './pages/CandidatePage';
import { EmployerPage } from './pages/EmployerPage';
import { ProfilePage } from './pages/ProfilePage';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <div className="app-layout">
          <Navbar contractAddress={CONTRACT_ADDRESS} />
          <Routes>
            <Route path="/" element={<Navigate to="/candidate" replace />} />
            <Route path="/candidate" element={<CandidatePage />} />
            <Route path="/employer" element={<EmployerPage />} />
            <Route path="/profile/:address" element={<ProfilePage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </WalletProvider>
  );
}

export default App;
