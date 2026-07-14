import type { TxState } from '../hooks/useCredChain';

interface TxStatusProps {
  txState: TxState;
  consensusMsg?: string;
}

const EXPLORER_BASE = 'https://studio.genlayer.com/run-debug';

export function TxStatus({ txState, consensusMsg }: TxStatusProps) {
  if (txState.status === 'idle') return null;

  if (txState.status === 'pending') {
    return (
      <div className="tx-status loading fade-in" id="tx-loading">
        <div className="tx-spinner" />
        <div className="tx-status-text">
          <div className="tx-status-title">
            {consensusMsg || txState.message || 'Processing transaction...'}
          </div>
          <div className="tx-status-sub">
            Waiting for GenLayer validator consensus · This may take 30–60 seconds
          </div>
        </div>
      </div>
    );
  }

  if (txState.status === 'success') {
    return (
      <div className="tx-status success fade-in" id="tx-success">
        <div style={{ fontSize: '1.25rem', flexShrink: 0 }}>✓</div>
        <div className="tx-status-text">
          <div className="tx-status-title" style={{ color: 'var(--green-400)' }}>
            {txState.message || 'Transaction confirmed!'}
          </div>
          {txState.hash && (
            <a
              href={EXPLORER_BASE}
              target="_blank"
              rel="noreferrer"
              className="tx-hash-link"
              id="tx-hash-link"
            >
              Tx: {txState.hash.slice(0, 10)}…{txState.hash.slice(-8)} ↗
            </a>
          )}
        </div>
      </div>
    );
  }

  if (txState.status === 'error') {
    return (
      <div className="error-alert fade-in" id="tx-error">
        <span style={{ flexShrink: 0 }}>⚠</span>
        <span>{txState.error || 'Transaction failed. Please try again.'}</span>
      </div>
    );
  }

  return null;
}
