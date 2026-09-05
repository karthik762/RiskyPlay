import React from 'react';
import {
  Activity,
  CreditCard,
  Shield,
  FileText,
  Database,
} from './icons';

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </svg>
    ),
  },
  {
    id: 'transactions',
    label: 'Transactions',
    badge: 'Real-Time',
    icon: <CreditCard size={17} />,
  },
  {
    id: 'chargebacks',
    label: 'Chargeback Defense',
    highlight: true,
    badge: 'Showcase',
    icon: <Shield size={17} />,
  },
  {
    id: 'traces',
    label: 'Agent Traces',
    icon: <Activity size={17} />,
  },
  {
    id: 'analytics',
    label: 'Benchmark & Evaluation',
    badge: '150 Cases',
    icon: <Database size={17} />,
  },
];

export default function Sidebar({ activeTab, setActiveTab }) {
  return (
    <aside style={{
      width: '250px',
      borderRight: '1px solid var(--border-subtle)',
      background: 'rgba(14, 19, 41, 0.55)',
      padding: '1.5rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div>
        <div className="label-editorial" style={{ padding: '0 0.75rem 0.85rem' }}>
          Merchant Navigation
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--dry-sage-border)' : 'transparent',
                  background: isActive
                    ? 'rgba(174, 169, 137, 0.14)'
                    : item.highlight
                    ? 'rgba(19, 25, 54, 0.75)'
                    : 'transparent',
                  color: isActive ? 'var(--text-cream)' : item.highlight ? 'var(--dry-sage)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.8125rem',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <span style={{ color: isActive ? 'var(--dry-sage)' : 'inherit' }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span style={{
                    fontSize: '0.625rem',
                    padding: '0.1rem 0.35rem',
                    borderRadius: '3px',
                    background: item.highlight ? 'rgba(174, 169, 137, 0.22)' : 'rgba(174, 169, 137, 0.08)',
                    color: item.highlight ? 'var(--dry-sage)' : 'var(--text-muted)',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Defensive Core Architecture Banner */}
      <div style={{
        padding: '1rem',
        borderRadius: '6px',
        background: 'rgba(18, 27, 46, 0.7)',
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#ffffff',
          marginBottom: '0.25rem',
        }}>
          Defense Invariant Core
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          All AI recommendations are advisory and verified deterministically against the Evidence Vault.
        </div>
      </div>
    </aside>
  );
}
