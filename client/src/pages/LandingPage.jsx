import React from 'react';
import { Shield, ShieldCheck, Scale, Archive, ArrowUpRight, Zap } from '../components/icons';

export default function LandingPage({ onEnterDemo, onOpenLogin, onOpenSignup }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Editorial Header */}
      <header style={{
        padding: '1.75rem 3.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #1d2652 0%, #131936 100%)',
            border: '1px solid var(--dry-sage-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--dry-sage)',
          }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.35rem',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--text-cream)',
            }}>
              RiskyPlay
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <button onClick={onOpenLogin} className="btn btn-outline">
            Merchant Sign In
          </button>
          <button onClick={onEnterDemo} className="btn btn-primary">
            <Zap size={14} />
            <span>Launch Demo Workspace</span>
          </button>
        </div>
      </header>

      {/* Hero Body — Classical Editorial Roman Headline */}
      <main style={{
        flex: 1,
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '5.5rem 2rem 4rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '2.5rem',
      }}>
        {/* Editorial Sub-Heading Tag — Dry Sage */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.85rem',
          borderRadius: '4px',
          background: 'var(--dry-sage-bg)',
          border: '1px solid var(--dry-sage-border)',
          fontSize: '0.72rem',
          color: 'var(--dry-sage)',
          letterSpacing: '0.08em',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          <span>Defense-Only Multi-Agent Architecture</span>
        </div>

        {/* Large Editorial Headline */}
        <div style={{ maxWidth: '820px' }}>
          <h1 style={{
            fontSize: '4.25rem',
            lineHeight: 1.08,
            letterSpacing: '-0.025em',
            marginBottom: '1.5rem',
            fontStyle: 'normal',
          }}>
            Risk,<br />
            <span style={{
              fontStyle: 'italic',
              fontWeight: 400,
              color: '#e2e8f0',
            }}>
              before loss.
            </span>
          </h1>

          <p style={{
            fontSize: '1.15rem',
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            maxWidth: '680px',
            margin: '0 auto',
          }}>
            AI-powered risk detection and grounded chargeback defense for digital merchants.
            Deterministic rule authority paired with verified evidence intelligence.
          </p>
        </div>

        {/* Primary CTA Buttons */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={onEnterDemo} className="btn btn-primary btn-lg">
            <Zap size={16} />
            <span>Enter RiskyPlay</span>
          </button>

          <button onClick={onOpenSignup} className="btn btn-secondary btn-lg">
            <span>Register Merchant</span>
            <ArrowUpRight size={16} />
          </button>
        </div>

        {/* Supporting Editorial Tags */}
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: '1rem',
          fontSize: '0.6875rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
          color: 'var(--text-muted)',
        }}>
          <span>Real-Time Risk</span>
          <span>•</span>
          <span>Evidence Intelligence</span>
          <span>•</span>
          <span>AI Analysis</span>
          <span>•</span>
          <span>Defensive Decisions</span>
        </div>

        {/* Feature Blocks (Navy with clean SVG icons, NO emojis) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '1.5rem',
          width: '100%',
          marginTop: '3.5rem',
          textAlign: 'left',
        }}>
          <div className="card">
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '6px',
              background: 'rgba(174, 169, 137, 0.15)',
              border: '1px solid var(--dry-sage-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dry-sage)',
              marginBottom: '1rem',
            }}>
              <Scale size={20} />
            </div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>
              Deterministic Risk Authority
            </h3>
            <p>
              Mathematical rule scoring (0–100) is the sole financial authority. Advisory AI cannot silently override or block approved transactions.
            </p>
          </div>

          <div className="card">
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '6px',
              background: 'rgba(19, 25, 54, 0.85)',
              border: '1px solid var(--dry-sage-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dry-sage)',
              marginBottom: '1rem',
            }}>
              <Archive size={20} />
            </div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>
              Evidence Vault Intelligence
            </h3>
            <p>
              Carrier proofs of delivery, direct signatures, GPS coordinates, customer chat transcripts, and consent hashes are indexed as ground truth.
            </p>
          </div>

          <div className="card">
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '6px',
              background: 'rgba(52, 211, 153, 0.12)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399',
              marginBottom: '1rem',
            }}>
              <Shield size={20} />
            </div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>
              Zero-Hallucination Guardrail
            </h3>
            <p>
              Every claim generated in dispute rebuttals must link to a valid Evidence ID. Ungrounded accusations and outcome promises are rejected.
            </p>
          </div>
        </div>
      </main>

      {/* Editorial Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '2rem 3rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
      }}>
        <div>RiskyPlay &copy; 2026 &bull; Defensive Merchant Risk Management Platform</div>
        <div style={{ fontFamily: 'var(--font-mono)' }}>Defense Invariant Core &bull; Zero Destructive Execution</div>
      </footer>
    </div>
  );
}
