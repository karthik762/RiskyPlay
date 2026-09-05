import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import ChargebackDetailPage from './ChargebackDetailPage';

export default function ChargebacksPage({ selectedChargebackId, setSelectedChargebackId }) {
  const [chargebacks, setChargebacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadChargebacks();
  }, [statusFilter]);

  async function loadChargebacks() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.chargebacks.list(params);
      if (res?.data) {
        setChargebacks(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load chargebacks');
    } finally {
      setLoading(false);
    }
  }

  // If a specific chargeback is selected, render the primary detail showcase screen
  if (selectedChargebackId) {
    return (
      <ChargebackDetailPage
        chargebackId={selectedChargebackId}
        onBack={() => setSelectedChargebackId(null)}
      />
    );
  }

  return (
    <div className="page-container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header & Filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Chargeback Defense Portal</h1>
          <p>Automated evidence retrieval, grounded rebuttal generation, and deterministic defense decisions.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field"
            style={{ width: '180px', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="UNDER_REVIEW">UNDER_REVIEW</option>
            <option value="WON">WON</option>
            <option value="LOST">LOST</option>
          </select>
        </div>
      </div>

      {/* Featured Showcase Dispute Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid var(--border-accent)',
        borderRadius: '12px',
        padding: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                CB-2026-8891
              </span>
              <span className="badge badge-high">$1,249.99 USD</span>
              <span className="badge badge-neutral">Visa 10.4 Fraud</span>
              <span className="badge badge-verified">4 Vault Items</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Cardholder unrecognized charge claim. Signed FedEx proof, AVS address match, and support ticket attached. Deterministically verified rebuttal ready.
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            const showcase = chargebacks.find(c => c.caseNumber === 'CB-2026-8891') || chargebacks[0];
            if (showcase) {
              setSelectedChargebackId(showcase._id);
            }
          }}
          className="btn btn-primary"
        >
          <span>Open Full Defense Showcase</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {error && (
        <div style={{
          background: 'var(--risk-high-bg)',
          border: '1px solid var(--risk-high-border)',
          borderRadius: '8px',
          padding: '1rem',
          color: 'var(--risk-high)',
        }}>
          {error}
        </div>
      )}

      {/* Chargebacks Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Case Number</th>
                <th>Network</th>
                <th>Dispute Reason</th>
                <th>Amount</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem' }}>
                    Loading chargeback cases...
                  </td>
                </tr>
              ) : chargebacks.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem' }}>
                    No dispute cases found.
                  </td>
                </tr>
              ) : (
                chargebacks.map((cb) => (
                  <tr
                    key={cb._id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedChargebackId(cb._id)}
                  >
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {cb.caseNumber}
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                        {cb.network}
                      </span>
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {cb.reasonCode}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {cb.reasonDescription || 'Disputed Transaction'}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      ${(cb.disputeAmount || 0).toFixed(2)} USD
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {cb.deadlineDate
                        ? new Date(cb.deadlineDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '14 days remaining'}
                    </td>
                    <td>
                      <span className={`badge ${
                        cb.status === 'WON'
                          ? 'badge-low'
                          : cb.status === 'OPEN'
                          ? 'badge-high'
                          : 'badge-med'
                      }`}>
                        {cb.status}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedChargebackId(cb._id);
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        Inspect Defense
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
