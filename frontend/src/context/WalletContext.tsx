import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface WalletCtx {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletCtx>({
  address: null,
  isConnected: false,
  connect: async () => {},
  disconnect: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

const STUDIONET_CHAIN = {
  chainId: '0xF23F', // 61999
  chainName: 'GenLayer Studionet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: ['https://studio.genlayer.com/api'],
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  const connect = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) { alert('MetaMask not found. Please install MetaMask.'); return; }
    try {
      // Request accounts
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) return;

      // Switch/add Studionet
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: STUDIONET_CHAIN.chainId }] });
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [STUDIONET_CHAIN] });
        }
      }

      setAddress(accounts[0]);

      eth.on('accountsChanged', (accs: string[]) => setAddress(accs[0] || null));
    } catch (e) {
      console.error('Wallet connect error:', e);
    }
  }, []);

  const disconnect = useCallback(() => setAddress(null), []);

  return (
    <WalletContext.Provider value={{ address, isConnected: !!address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}
