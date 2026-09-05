import React, { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { ShieldCheck } from '../components/icons';

export default function SignupPage({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err) {
      setError(err.message || 'Registration failed. Check your inputs.');
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
            Register Merchant
          </h2>
          <p style={{ fontSize: '0.8125rem' }}>
            Establish isolated merchant risk and dispute infrastructure
          </p>
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
            <label className="input-label">Business / Store Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apex Hardware Co."
              className="input-field"
            />
          </div>

          <div>
            <label className="input-label">Work Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="merchant@yourdomain.com"
              className="input-field"
            />
          </div>

          <div>
            <label className="input-label">Security Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '0.35rem' }}
          >
            {loading ? 'Registering Workspace...' : 'Create Merchant Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Already registered?{' '}
          <span
            onClick={onSwitchToLogin}
            style={{ color: 'var(--text-accent)', cursor: 'pointer', fontWeight: 600 }}
          >
            Sign In
          </span>
        </div>
      </div>
    </div>
  );
}
