import React from 'react';

export default function LandingPage({ onEnterDemo, onOpenLogin, onOpenSignup }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Hero Header */}
      <header style={{
        padding: '1.5rem 3rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>RiskyPlay</span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onOpenLogin} className="btn btn-outline btn-sm">
            Merchant Sign In
          </button>
          <button onClick={onEnterDemo} className="btn btn-primary btn-sm">
            ⚡ Instant Demo Access
          </button>
        </div>
      </header>

      {/* Hero Body */}
      <main style={{
        flex: 1,
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '5rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '2.5rem',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 1rem',
          borderRadius: '9999px',
          background: 'rgba(99, 102, 241, 0.12)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          fontSize: '0.8rem',
          color: '#a5b4fc',
          fontWeight: 600,
        }}>
          <span>🛡️ DEFENSE-ONLY MULTI-AGENT ARCHITECTURE</span>
        </div>

        <h1 style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em' }}>
          Automated Grounded Rebuttals &<br />
          <span style={{
            background: 'linear-gradient(135deg, #818cf8 0%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Authoritative Risk Prevention
          </span>
        </h1>

        <p style={{ maxWidth: '720px', fontSize: '1.15rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          RiskyPlay pairs advisory LLM risk analysis with strict deterministic verification guardrails. Eliminate hallucinations, protect merchant revenue, and defend disputes with evidence-anchored precision.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={onEnterDemo} className="btn btn-primary btn-lg" style={{ fontSize: '1.05rem', padding: '0.875rem 2.25rem' }}>
            ⚡ Launch Demo Dashboard
          </button>

          <button onClick={onOpenSignup} className="btn btn-outline btn-lg" style={{ fontSize: '1.05rem', padding: '0.875rem 2rem' }}>
            Register New Merchant
          </button>
        </div>

        {/* Feature Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          width: '100%',
          marginTop: '3rem',
          textAlign: 'left',
        }}>
          <div className="card">
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>⚖️</div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.15rem' }}>Deterministic Risk Authority</h3>
            <p style={{ fontSize: '0.875rem' }}>
              Mathematical rule scoring (0–100) is the sole financial authority. AI cannot silently override approved transactions or trigger unwarranted declines.
            </p>
          </div>

          <div className="card">
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>🗄️</div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.15rem' }}>Evidence Vault Intelligence</h3>
            <p style={{ fontSize: '0.875rem' }}>
              Carrier proof of delivery, AVS address matches, GPS coordinates, customer chat transcripts, and consent hashes are indexed as ground truth.
            </p>
          </div>

          <div className="card">
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>🛡️</div>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.15rem' }}>Zero-Hallucination Guardrails</h3>
            <p style={{ fontSize: '0.875rem' }}>
              Every claim generated in dispute rebuttals must link to a valid Evidence ID. Ungrounded fraud accusations and outcome guarantees are blocked deterministically.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '1.5rem 2rem',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
      }}>
        RiskyPlay © 2026 • Defensive AI Risk Manager • Production Hackathon Demo
      </footer>
    </div>
  );
}
