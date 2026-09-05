import React, { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { ShieldCheck, Zap } from '../components/icons';

export default function LoginPage({ onSwitchToSignup }) {
  const { login, fillDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFillDemo = () => {
    const demo = fillDemo();
    setEmail(demo.email);
    setPassword(demo.password);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div className="card animate-fade-in" style={{
        maxWidth: '430px',
        width: '100%',
        padding: '2.5rem',
        border: '1px solid var(--border-editorial)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #1d2652 0%, #131936 100%)',
            border: '1px solid var(--dry-sage-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            color: 'var(--dry-sage)',
          }}>
            <ShieldCheck size={22} />
          </div>
          <h2 style={{ marginBottom: '0.35rem' }}>
            Merchant Workspace
          </h2>
          <p style={{ fontSize: '0.8125rem' }}>
            Defensive AI Risk & Grounded Dispute Intelligence
          </p>
        </div>

        {/* Quick Demo Fill Banner (Clean SVG, NO emojis) */}
        <div style={{
          background: 'var(--dry-sage-bg)',
          border: '1px solid var(--dry-sage-border)',
          borderRadius: '6px',
          padding: '0.85rem 1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ color: '#a5b4fc' }}>
              <Zap size={16} />
            </span>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#c7d2fe' }}>
                Instant Demo Access
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                Populates seeded merchant credentials
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFillDemo}
            className="btn btn-primary btn-sm"
          >
            Auto-Fill
          </button>
        </div>

        {error && (
          <div style={{
            background: 'var(--risk-high-bg)',
            border: '1px solid var(--risk-high-border)',
            borderRadius: '6px',
            padding: '0.75rem',
            color: 'var(--risk-high)',
            fontSize: '0.8125rem',
            marginBottom: '1.25rem',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label className="input-label">Merchant Work Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="demo@riskyplay.com"
              className="input-field"
            />
          </div>

          <div>
            <label className="input-label">Security Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '0.35rem' }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Workspace'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Need a new merchant workspace?{' '}
          <span
            onClick={onSwitchToSignup}
            style={{ color: 'var(--text-accent)', cursor: 'pointer', fontWeight: 600 }}
          >
            Register Merchant
          </span>
        </div>
      </div>
    </div>
  );
}
