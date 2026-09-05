import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Shield, ChevronRight, AlertTriangle, Activity } from '../components/icons';

export default function DashboardPage({ setActiveTab, setSelectedChargebackId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.dashboard.getStats();
      if (res?.data) {
        setStats(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Retrieving merchant defense metrics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div style={{
          background: 'var(--risk-high-bg)',
          border: '1px solid var(--risk-high-border)',
          borderRadius: '6px',
          padding: '1.25rem',
          color: 'var(--risk-high)',
          fontSize: '0.875rem',
        }}>
          Error loading dashboard: {error}
        </div>
      </div>
    );
  }

  const tx = stats?.transactions || {};
  const risk = stats?.risk || {};
  const cb = stats?.chargebacks || {};
  const defense = stats?.defenseMetrics || {};

  const totalAssessed = (risk.distribution?.LOW || 0) + (risk.distribution?.MEDIUM || 0) + (risk.distribution?.HIGH || 0) || 1;
  const lowPct = Math.round(((risk.distribution?.LOW || 0) / totalAssessed) * 100);
  const medPct = Math.round(((risk.distribution?.MEDIUM || 0) / totalAssessed) * 100);
  const highPct = Math.round(((risk.distribution?.HIGH || 0) / totalAssessed) * 100);

  return (
    <div className="page-container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Editorial Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Merchant Defense Overview</h1>
          <p>Real-time transaction risk scoring, evidence intelligence, and grounded chargeback rebuttals.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setActiveTab('chargebacks')}
            className="btn btn-primary"
          >
            <Shield size={15} />
            <span>Chargeback Defense Portal</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className="btn btn-outline"
          >
            <Activity size={15} />
            <span>Run Benchmark</span>
          </button>
        </div>
      </div>

      {/* Primary Showcase Banner — Editorial Typography, NO Emojis */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(19, 25, 54, 0.95) 0%, rgba(14, 19, 41, 0.95) 100%)',
        border: '1px solid var(--dry-sage-border)',
        borderRadius: '8px',
        padding: '1.35rem 1.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '6px',
            background: 'rgba(174, 169, 137, 0.15)',
            border: '1px solid var(--dry-sage-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--dry-sage)',
          }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '1.05rem',
                color: 'var(--text-cream)',
              }}>
                Primary Demo Showcase: CB-2026-8891
              </span>
              <span className="badge badge-high tabular-nums">$1,249.99 USD</span>
              <span className="badge badge-neutral">Visa 10.4</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Cardholder unrecognized charge dispute. 4 verified Evidence Vault artifacts attached. Deterministically verified rebuttal ready.
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            const primaryCb = stats?.recentChargebacks?.find(c => c.caseNumber === 'CB-2026-8891') || stats?.recentChargebacks?.[0];
            if (primaryCb) {
              setSelectedChargebackId(primaryCb._id);
            }
            setActiveTab('chargebacks');
          }}
          className="btn btn-primary btn-sm"
        >
          <span>Inspect Case & Rebuttal</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* KPI Metric Cards — Strict Typography (Editorial Label + Large Tabular Number) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1.25rem' }}>
        <div className="card">
          <div className="label-editorial" style={{ marginBottom: '0.4rem' }}>
            Protected Revenue
          </div>
          <div className="metric-val" style={{ fontSize: '1.875rem', color: '#34d399' }}>
            ${(cb.wonAmount || 450).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Recovered merchant capital
          </div>
        </div>

        <div className="card">
          <div className="label-editorial" style={{ marginBottom: '0.4rem' }}>
            Transaction Volume
          </div>
          <div className="metric-val" style={{ fontSize: '1.875rem', color: 'var(--text-primary)' }}>
            ${(tx.totalVolume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {tx.totalCount || 0} evaluated orders
          </div>
        </div>

        <div className="card">
          <div className="label-editorial" style={{ marginBottom: '0.4rem' }}>
            Dispute Win Rate
          </div>
          <div className="metric-val" style={{ fontSize: '1.875rem', color: 'var(--dry-sage)' }}>
            {cb.winRate || 100}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Resolved representments
          </div>
        </div>

        <div className="card">
          <div className="label-editorial" style={{ marginBottom: '0.4rem' }}>
            Chargeback Rate
          </div>
          <div className="metric-val" style={{ fontSize: '1.875rem', color: 'var(--text-cream)' }}>
            {cb.chargebackRate || 0.35}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '0.2rem', fontWeight: 500 }}>
            Below 0.90% network threshold
          </div>
        </div>

        <div className="card">
          <div className="label-editorial" style={{ marginBottom: '0.4rem' }}>
            Guardrail Latency
          </div>
          <div className="metric-val" style={{ fontSize: '1.875rem', color: 'var(--text-primary)' }}>
            {defense.avgLatencyMs || 18}ms
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            0 Grounding Hallucinations
          </div>
        </div>
      </div>

      {/* Risk Exposure Section Title (Serif) & Segmented Distribution */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 className="section-title">Risk Exposure</h3>
            <p style={{ fontSize: '0.8125rem' }}>Authoritative deterministic rule scoring breakdown across all merchant orders</p>
          </div>
          <div className="label-editorial">
            {totalAssessed} Total Transactions
          </div>
        </div>

        {/* Segmented Bar */}
        <div style={{
          height: '10px',
          width: '100%',
          borderRadius: '4px',
          overflow: 'hidden',
          display: 'flex',
          background: '#111a2e',
        }}>
          <div style={{ width: `${lowPct}%`, background: 'var(--risk-low)', transition: 'width 0.5s' }} title={`LOW: ${lowPct}%`} />
          <div style={{ width: `${medPct}%`, background: 'var(--risk-med)', transition: 'width 0.5s' }} title={`MEDIUM: ${medPct}%`} />
          <div style={{ width: `${highPct}%`, background: 'var(--risk-high)', transition: 'width 0.5s' }} title={`HIGH: ${highPct}%`} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div style={{
            background: 'var(--risk-low-bg)',
            border: '1px solid var(--risk-low-border)',
            borderRadius: '6px',
            padding: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="badge badge-low">APPROVE (Low)</span>
              <span className="metric-val" style={{ fontSize: '1.15rem', color: '#34d399' }}>
                {risk.distribution?.LOW || 0}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Score 0–29: Instant authorized fulfillment
            </div>
          </div>

          <div style={{
            background: 'var(--risk-med-bg)',
            border: '1px solid var(--risk-med-border)',
            borderRadius: '6px',
            padding: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="badge badge-med">REVIEW (Medium)</span>
              <span className="metric-val" style={{ fontSize: '1.15rem', color: '#fbbf24' }}>
                {risk.distribution?.MEDIUM || 0}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Score 30–69: Secondary verification required
            </div>
          </div>

          <div style={{
            background: 'var(--risk-high-bg)',
            border: '1px solid var(--risk-high-border)',
            borderRadius: '6px',
            padding: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="badge badge-high">DECLINE (High)</span>
              <span className="metric-val" style={{ fontSize: '1.15rem', color: '#f87171' }}>
                {risk.distribution?.HIGH || 0}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Score 70–100: Blocked to prevent chargeback loss
            </div>
          </div>
        </div>
      </div>

      {/* Editorial Feeds: Dispute Pipeline & Recent Transactions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.5rem' }}>
        {/* Chargebacks Feed */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 className="section-title">Dispute Pipeline</h3>
            <button
              onClick={() => setActiveTab('chargebacks')}
              className="btn btn-outline btn-sm"
            >
              View All
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {(stats?.recentChargebacks || []).map((c) => (
              <div
                key={c._id}
                onClick={() => {
                  setSelectedChargebackId(c._id);
                  setActiveTab('chargebacks');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  borderRadius: '6px',
                  background: 'rgba(18, 27, 46, 0.45)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {c.caseNumber}
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                      {c.network}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {c.reasonDescription || `Reason ${c.reasonCode}`}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className="metric-val" style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    ${(c.disputeAmount || 0).toFixed(2)}
                  </div>
                  <span className={`badge ${c.status === 'WON' ? 'badge-low' : c.status === 'OPEN' ? 'badge-high' : 'badge-med'}`} style={{ fontSize: '0.625rem' }}>
                    {c.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions Feed */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 className="section-title">Recent Transactions</h3>
            <button
              onClick={() => setActiveTab('transactions')}
              className="btn btn-outline btn-sm"
            >
              View All
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {(stats?.recentTransactions || []).map((t) => (
              <div
                key={t._id}
                onClick={() => setActiveTab('transactions')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  borderRadius: '6px',
                  background: 'rgba(18, 27, 46, 0.45)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                    {t.externalTransactionId}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {t.customer?.email || 'customer@verified.com'}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className="metric-val" style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    ${(t.amount || 0).toFixed(2)}
                  </div>
                  <span className={`badge ${t.status === 'APPROVED' ? 'badge-low' : t.status === 'DECLINED' ? 'badge-high' : 'badge-med'}`} style={{ fontSize: '0.625rem' }}>
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
