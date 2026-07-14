import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

interface WalletCtx {
  address: string | null;
  isConnected: boolean;
  chainId: string | null;
  isCorrectNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

const WalletContext = createContext<WalletCtx>({
  address: null,
  isConnected: false,
  chainId: null,
  isCorrectNetwork: false,
  connect: async () => {},
  disconnect: () => {},
  error: null,
});

export function useWallet() {
  return useContext(WalletContext);
}

const STUDIONET_CHAIN = {
  chainId: '0xF22F', // 61999
  chainName: 'GenLayer Studionet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: ['https://studio.genlayer.com/api'],
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCorrectNetwork = chainId === '0xF22F' || chainId === '0xf22f';

  const checkNetworkAndConnect = useCallback(async (eth: any, forceSwitch = false) => {
    try {
      const currentChainId = await eth.request({ method: 'eth_chainId' });
      setChainId(currentChainId);

      if (currentChainId !== '0xF22F' && currentChainId !== '0xf22f') {
        if (forceSwitch) {
          try {
            await eth.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: STUDIONET_CHAIN.chainId }],
            });
            setChainId(STUDIONET_CHAIN.chainId);
            setError(null);
            return true;
          } catch (switchErr: any) {
            if (switchErr.code === 4902) {
              try {
                await eth.request({
                  method: 'wallet_addEthereumChain',
                  params: [STUDIONET_CHAIN],
                });
                setChainId(STUDIONET_CHAIN.chainId);
                setError(null);
                return true;
              } catch (addErr: any) {
                const errMsg = addErr.message || String(addErr);
                setError(`Failed to add GenLayer Studionet network: ${errMsg}`);
                return false;
              }
            } else {
              const errMsg = switchErr.message || String(switchErr);
              setError(`Please switch MetaMask to the GenLayer Studionet network: ${errMsg}`);
              return false;
            }
          }
        } else {
          setError('Incorrect network. Please switch to GenLayer Studionet.');
          return false;
        }
      }
      setError(null);
      return true;
    } catch (e: any) {
      setError(`Network check failed: ${e.message || e}`);
      return false;
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const eth = (window as any).ethereum;
    if (!eth) {
      setError('MetaMask not found. Please install MetaMask.');
      alert('MetaMask not found. Please install MetaMask.');
      return;
    }
    try {
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) {
        setError('No accounts returned from wallet.');
        return;
      }

      // First confirm Studionet network succeeds before storing address
      const networkOk = await checkNetworkAndConnect(eth, true);
      if (networkOk) {
        setAddress(accounts[0]);
      } else {
        setAddress(null);
      }
    } catch (e: any) {
      console.error('Wallet connect error:', e);
      setError(e.message || String(e));
      setAddress(null);
    }
  }, [checkNetworkAndConnect]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setError(null);
  }, []);

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (eth) {
      // Query already connected accounts
      eth.request({ method: 'eth_accounts' })
        .then(async (accounts: string[]) => {
          if (accounts && accounts.length > 0) {
            const networkOk = await checkNetworkAndConnect(eth, false);
            if (networkOk) {
              setAddress(accounts[0]);
            }
          }
        })
        .catch((err: any) => console.error('Error fetching accounts:', err));

      const handleAccounts = async (accs: string[]) => {
        if (accs.length > 0) {
          const networkOk = await checkNetworkAndConnect(eth, false);
          if (networkOk) {
            setAddress(accs[0]);
          } else {
            setAddress(null);
          }
        } else {
          setAddress(null);
        }
      };

      const handleChain = (newChainId: string) => {
        setChainId(newChainId);
        // Re-check accounts when chain changes
        eth.request({ method: 'eth_accounts' })
          .then((accounts: string[]) => {
            const isCorrect = newChainId === '0xF22F' || newChainId === '0xf22f';
            if (accounts.length > 0 && isCorrect) {
              setAddress(accounts[0]);
              setError(null);
            } else {
              setAddress(null);
              if (!isCorrect) {
                setError('Incorrect network. Please switch to GenLayer Studionet.');
              }
            }
          })
          .catch((err: any) => console.error('Error fetching accounts on chain change:', err));
      };

      eth.on('accountsChanged', handleAccounts);
      eth.on('chainChanged', handleChain);

      // Get initial chain ID on load
      eth.request({ method: 'eth_chainId' })
        .then((cid: string) => setChainId(cid))
        .catch((err: any) => console.error('Error fetching chainId:', err));

      return () => {
        if (eth.removeListener) {
          eth.removeListener('accountsChanged', handleAccounts);
          eth.removeListener('chainChanged', handleChain);
        }
      };
    }
  }, [checkNetworkAndConnect]);

  return (
    <WalletContext.Provider value={{
      address,
      isConnected: !!address && isCorrectNetwork,
      chainId,
      isCorrectNetwork,
      connect,
      disconnect,
      error,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
