import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Search, Activity, ShieldCheck, CheckCircle } from '../components/icons';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Detail Modal state
  const [selectedTx, setSelectedTx] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);
  const [traces, setTraces] = useState([]);
  const [orchestrating, setOrchestrating] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, [statusFilter]);

  async function loadTransactions() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.transactions.list(params);
      if (res?.data) {
        setTransactions(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  async function openTransactionDetail(tx) {
    setSelectedTx(tx);
    setDetailLoading(true);
    setRiskAssessment(null);
    setTraces([]);
    try {
      const [riskRes, tracesRes] = await Promise.allSettled([
        api.transactions.assessRisk(tx._id),
        api.transactions.getTraces(tx._id),
      ]);

      if (riskRes.status === 'fulfilled' && riskRes.value?.data) {
        setRiskAssessment(riskRes.value.data);
      }
      if (tracesRes.status === 'fulfilled' && tracesRes.value?.data) {
        setTraces(tracesRes.value.data);
      }
    } catch (err) {
      console.error('Error fetching transaction detail:', err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRunOrchestration() {
    if (!selectedTx) return;
    setOrchestrating(true);
    try {
      const res = await api.transactions.orchestrateRisk(selectedTx._id);
      if (res?.data?.assessment) {
        setRiskAssessment(res.data.assessment);
      }
      const tracesRes = await api.transactions.getTraces(selectedTx._id);
      if (tracesRes?.data) {
        setTraces(tracesRes.data);
      }
    } catch (err) {
      alert(`Orchestration error: ${err.message}`);
    } finally {
      setOrchestrating(false);
    }
  }

  const filteredTransactions = transactions.filter((t) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.externalTransactionId?.toLowerCase().includes(term) ||
      t.customer?.email?.toLowerCase().includes(term) ||
      t.customer?.billingAddress?.city?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="page-container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Transactions & Risk Scoring</h1>
          <p>Deterministic transaction scoring, explainable rule signals, and advisory AI analysis.</p>
        </div>

        {/* Filter Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search ID, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
              style={{ width: '220px', padding: '0.5rem 0.75rem' }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field"
            style={{ width: '160px', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Statuses</option>
            <option value="APPROVED">APPROVED</option>
            <option value="MANUAL_REVIEW">MANUAL_REVIEW</option>
            <option value="DECLINED">DECLINED</option>
          </select>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'var(--risk-high-bg)',
          border: '1px solid var(--risk-high-border)',
          borderRadius: '6px',
          padding: '1rem',
          color: 'var(--risk-high)',
        }}>
          {error}
        </div>
      )}

      {/* Transactions Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Payment Method</th>
                <th>Status</th>
                <th>Timestamp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>
                    No transactions found.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx._id} style={{ cursor: 'pointer' }} onClick={() => openTransactionDetail(tx)}>
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {tx.externalTransactionId}
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)' }}>{tx.customer?.email || 'N/A'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {tx.customer?.billingAddress?.city}, {tx.customer?.billingAddress?.country}
                      </div>
                    </td>
                    <td className="metric-val" style={{ color: 'var(--text-primary)' }}>
                      ${(tx.amount || 0).toFixed(2)} {tx.currency}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        {tx.paymentMethod?.cardType} &bull;&bull;&bull;&bull; {tx.paymentMethod?.cardLast4}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${
                        tx.status === 'APPROVED'
                          ? 'badge-low'
                          : tx.status === 'DECLINED'
                          ? 'badge-high'
                          : 'badge-med'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {new Date(tx.timestamp || tx.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTransactionDetail(tx);
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        Inspect Risk
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Detail Drawer / Modal */}
      {selectedTx && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.78)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1.5rem',
        }}>
          <div className="card animate-fade-in" style={{
            maxWidth: '920px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-editorial)',
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.4rem' }}>
                    {selectedTx.externalTransactionId}
                  </h2>
                  <span className={`badge ${
                    selectedTx.status === 'APPROVED' ? 'badge-low' : selectedTx.status === 'DECLINED' ? 'badge-high' : 'badge-med'
                  }`}>
                    {selectedTx.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Amount: ${selectedTx.amount} {selectedTx.currency} &bull; Customer: {selectedTx.customer?.email}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleRunOrchestration}
                  disabled={orchestrating}
                  className="btn btn-primary btn-sm"
                >
                  <Activity size={14} />
                  <span>{orchestrating ? 'Orchestrating...' : 'Run 3-Agent Orchestration'}</span>
                </button>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="btn btn-outline btn-sm"
                >
                  Close
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>Evaluating risk engine...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* 1. Risk Engine Score Summary */}
                {riskAssessment && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '1rem',
                    padding: '1.25rem',
                    borderRadius: '6px',
                    background: 'rgba(18, 27, 46, 0.5)',
                    border: '1px solid var(--border-card)',
                  }}>
                    <div>
                      <div className="label-editorial">Deterministic Score</div>
                      <div className="metric-val" style={{ fontSize: '1.75rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                        {riskAssessment.riskScore}
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}> / 100</span>
                      </div>
                    </div>

                    <div>
                      <div className="label-editorial">Risk Tier</div>
                      <div style={{ marginTop: '0.4rem' }}>
                        <span className={`badge ${
                          riskAssessment.riskTier === 'LOW' ? 'badge-low' : riskAssessment.riskTier === 'HIGH' ? 'badge-high' : 'badge-med'
                        }`}>
                          {riskAssessment.riskTier}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="label-editorial">Authoritative Action</div>
                      <div style={{ marginTop: '0.4rem' }}>
                        <span className={`badge ${
                          riskAssessment.recommendation === 'APPROVE' ? 'badge-approve' : riskAssessment.recommendation === 'DECLINE' ? 'badge-decline' : 'badge-review'
                        }`}>
                          {riskAssessment.recommendation}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="label-editorial">AI Advisory Score</div>
                      <div className="metric-val" style={{ fontSize: '1.75rem', color: '#818cf8', marginTop: '0.2rem' }}>
                        {riskAssessment.aiScore ?? 'N/A'}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Deterministic Rule Triggers */}
                {riskAssessment?.ruleMatches?.length > 0 && (
                  <div>
                    <h3 className="section-title" style={{ marginBottom: '0.6rem', fontSize: '1.1rem' }}>
                      Deterministic Rules Fired
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {riskAssessment.ruleMatches.map((r, idx) => (
                        <div key={idx} style={{
                          padding: '0.75rem 1rem',
                          borderRadius: '6px',
                          background: 'rgba(12, 18, 32, 0.6)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{r.ruleName || r.rule}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.reason}</div>
                          </div>
                          <span className="badge badge-neutral">+{r.points} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. AI Risk Analyst Advisory Insights */}
                {riskAssessment?.aiAnalysis && (
                  <div style={{
                    padding: '1.25rem',
                    borderRadius: '6px',
                    background: 'rgba(67, 56, 202, 0.08)',
                    border: '1px solid rgba(129, 140, 248, 0.25)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 600,
                          fontSize: '0.95rem',
                          color: '#ffffff',
                        }}>
                          AI Risk Analyst Advisory Assessment
                        </span>
                        <span className="badge badge-neutral" style={{ fontSize: '0.6rem' }}>Advisory Only</span>
                      </div>
                      <span className="badge badge-verified" style={{ fontSize: '0.65rem' }}>
                        Status: {riskAssessment.aiAnalysis.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                      {riskAssessment.aiAnalysis.summary}
                    </p>

                    {riskAssessment.aiAnalysis.riskFactors?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {riskAssessment.aiAnalysis.riskFactors.map((rf, idx) => (
                          <span key={idx} className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                            {rf.code}: {rf.description}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Agent Trace Timeline */}
                {traces.length > 0 && (
                  <div>
                    <h3 className="section-title" style={{ marginBottom: '0.6rem', fontSize: '1.1rem' }}>
                      Multi-Agent Execution Log
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {traces.map((trace, idx) => (
                        <div key={idx} style={{
                          padding: '0.75rem 1rem',
                          borderRadius: '6px',
                          background: 'rgba(12, 18, 32, 0.8)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ color: '#818cf8', fontWeight: 600 }}>
                              Step {trace.stepIndex + 1}: {trace.agentName}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              ({trace.modelUsed || 'deterministic'})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{trace.latencyMs}ms</span>
                            <span className="badge badge-low" style={{ fontSize: '0.6rem' }}>{trace.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
