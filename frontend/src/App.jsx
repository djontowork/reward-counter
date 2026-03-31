import { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import {
  connectWallet,
  getCount,
  incrementCounter,
  CONTRACT_ID,
} from './stellar';

/* ─── Toast System ─── */
function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type} ${t.exiting ? 'exiting' : ''}`}
          onAnimationEnd={() => t.exiting && removeToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

let toastId = 0;

export default function App() {
  const [address, setAddress] = useState(null);
  const [contractId, setContractId] = useState(CONTRACT_ID);
  const [count, setCount] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [incrementing, setIncrementing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [popAnim, setPopAnim] = useState(false);
  const counterRef = useRef(null);

  /* Toast helper */
  const toast = useCallback((message, type = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, exiting: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* Connect Wallet */
  const handleConnect = useCallback(async () => {
    if (!contractId || contractId.length !== 56) {
      toast('Please enter a valid 56-character Contract ID.', 'error');
      return;
    }
    setConnecting(true);
    try {
      const addr = await connectWallet();
      setAddress(addr);
      toast('Wallet connected!', 'success');

      // Immediately fetch count
      try {
        const c = await getCount(contractId);
        setCount(c);
      } catch (e) {
        toast('Connected, but could not read count: ' + e.message, 'error');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setConnecting(false);
    }
  }, [contractId, toast]);

  /* Refresh Count */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const c = await getCount(contractId);
      setCount(c);
      toast('Counter refreshed.', 'info');
    } catch (e) {
      toast('Refresh failed: ' + e.message, 'error');
    } finally {
      setRefreshing(false);
    }
  }, [contractId, toast]);

  /* Increment */
  const handleIncrement = useCallback(async () => {
    setIncrementing(true);
    try {
      const newCount = await incrementCounter(address, contractId);
      if (newCount !== null) {
        setCount(newCount);
      } else {
        // Fetch updated count
        const c = await getCount(contractId);
        setCount(c);
      }
      setPopAnim(true);
      setTimeout(() => setPopAnim(false), 400);
      toast('Counter incremented!', 'success');
    } catch (e) {
      toast('Increment failed: ' + e.message, 'error');
    } finally {
      setIncrementing(false);
    }
  }, [address, contractId, toast]);

  /* Disconnect */
  const handleDisconnect = useCallback(() => {
    setAddress(null);
    setCount(null);
    toast('Wallet disconnected.', 'info');
  }, [toast]);

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="app">
        {/* ─── Logo ─── */}
        <div className="logo-section">
          <div className="logo-icon">🏆</div>
          <h1 className="app-title">Reward Counter</h1>
          <p className="app-subtitle">Decentralized Counter on Soroban</p>
        </div>

        {/* ─── Main Card ─── */}
        <div className="card">
          {!address ? (
            /* ─── Setup / Connect ─── */
            <div className="setup-section">
              <div className="input-group">
                <label htmlFor="contractId">Contract ID</label>
                <input
                  id="contractId"
                  type="text"
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  placeholder="Enter Soroban Contract ID"
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <>
                    <span className="spinner" />
                    Connecting…
                  </>
                ) : (
                  <>🔗 Connect Freighter</>
                )}
              </button>
            </div>
          ) : (
            /* ─── Dashboard ─── */
            <div className="dashboard">
              {/* Wallet Info */}
              <div className="wallet-bar">
                <div className="wallet-dot" />
                <span className="wallet-address">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                <span className="wallet-network">Testnet</span>
              </div>

              {/* Contract Info */}
              <div className="contract-id-bar">
                <span>Contract:</span>
                <span>{contractId}</span>
              </div>

              {/* Counter */}
              <div className="counter-section">
                <div className="counter-label">Current Count</div>
                <div
                  ref={counterRef}
                  className={`counter-value ${popAnim ? 'pop' : ''}`}
                >
                  {count !== null ? count : '—'}
                </div>
              </div>

              {/* Actions */}
              <div className="actions">
                <button
                  className="btn btn-secondary"
                  onClick={handleRefresh}
                  disabled={refreshing || incrementing}
                >
                  {refreshing ? (
                    <span className="spinner" />
                  ) : (
                    '🔄 Refresh'
                  )}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleIncrement}
                  disabled={incrementing || refreshing}
                >
                  {incrementing ? (
                    <>
                      <span className="spinner" />
                      Signing…
                    </>
                  ) : (
                    '▲ Increment'
                  )}
                </button>
              </div>

              {/* Disconnect */}
              <button className="btn btn-danger" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
