import React from 'react';
import { useAuth } from '../context/useAuth';
import { ShieldCheck, Activity, Bot } from './icons';

export default function Navbar({ activeTab, setActiveTab }) {
  const { merchant, logout } = useAuth();

  return (
    <header style={{
      height: '64px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(14, 19, 41, 0.94)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 2rem',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div
          onClick={() => setActiveTab('dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #1d2652 0%, #131936 100%)',
            border: '1px solid var(--dry-sage-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--dry-sage)',
          }}>
            <ShieldCheck size={18} />
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.15rem',
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              lineHeight: 1.1,
            }}>
              <span>RiskyPlay</span>
              <span className="badge badge-neutral" style={{ fontSize: '0.6rem', padding: '0.1rem 0.35rem' }}>
                DEFENSE
              </span>
            </div>
            <div className="label-editorial" style={{ fontSize: '0.625rem', marginTop: '0.15rem' }}>
              Merchant Financial Defense
            </div>
          </div>
        </div>

        {/* Live Status Indicators (Clean SVG, No Emojis) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginLeft: '1.25rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            padding: '0.2rem 0.55rem',
            borderRadius: '4px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#34d399',
            fontWeight: 500,
          }}>
            <Activity size={12} />
            <span>Deterministic Guardrail: Active</span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            padding: '0.2rem 0.55rem',
            borderRadius: '4px',
            background: 'rgba(8, 145, 178, 0.08)',
            border: '1px solid rgba(8, 145, 178, 0.25)',
            color: '#38bdf8',
            fontWeight: 500,
          }}>
            <Bot size={12} />
            <span>AI Risk Analyst: Advisory</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {merchant && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {merchant.name || 'Merchant Workspace'}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {merchant.email}
              </div>
            </div>
            <button
              onClick={logout}
              className="btn btn-outline btn-sm"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
