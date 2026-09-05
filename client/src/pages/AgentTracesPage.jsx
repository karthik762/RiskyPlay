import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function AgentTracesPage() {
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [agentFilter, setAgentFilter] = useState('');

  useEffect(() => {
    loadTraces();
  }, [agentFilter]);

  async function loadTraces() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (agentFilter) params.agentName = agentFilter;
      const res = await api.traces.list(params);
      if (res?.data) {
        setTraces(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load traces');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
            Audit & Telemetry
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', letterSpacing: '-0.02em', fontWeight: 600, color: 'var(--text-primary)', margin: '0.25rem 0' }}>
            Multi-Agent Execution Observability
          </h1>
          <p>Full audit trail of all agent reasoning steps, latencies, token consumption, and deterministic verification gates.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="input-field"
            style={{ width: '220px', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Specialized Agents</option>
            <option value="EVIDENCE">EVIDENCE</option>
            <option value="CHARGEBACK_RESPONSE">CHARGEBACK_RESPONSE</option>
            <option value="CHARGEBACK_RESPONSE_VERIFICATION">CHARGEBACK_RESPONSE_VERIFICATION</option>
            <option value="CHARGEBACK_DECISION">CHARGEBACK_DECISION</option>
            <option value="TRANSACTION_RISK_BASELINE">TRANSACTION_RISK_BASELINE</option>
            <option value="RISK_ANALYST">RISK_ANALYST</option>
            <option value="RISK_VERIFICATION">RISK_VERIFICATION</option>
          </select>
        </div>
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

      {/* Traces Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Entity Type</th>
                <th>Step</th>
                <th>Model Used</th>
                <th>Latency</th>
                <th>Tokens</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem' }}>
                    Loading agent traces...
                  </td>
                </tr>
              ) : traces.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem' }}>
                    No execution traces found.
                  </td>
                </tr>
              ) : (
                traces.map((t) => (
                  <tr key={t._id} style={{ cursor: 'pointer' }} onClick={() => setSelectedTrace(t)}>
                    <td style={{ fontWeight: 600, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                      {t.agentName}
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        {t.entityType}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      Step #{t.stepIndex + 1}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {t.modelUsed || 'deterministic'}
                    </td>
                    <td className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {t.latencyMs}ms
                    </td>
                    <td className="tabular-nums" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {t.tokensUsed || 0}
                    </td>
                    <td>
                      <span className={`badge ${t.status === 'COMPLETED' ? 'badge-low' : 'badge-high'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTrace(t);
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        Inspect Payload
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trace Payload Modal */}
      {selectedTrace && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1.5rem',
        }}>
          <div className="card animate-fade-in" style={{
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-accent)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', color: 'var(--text-primary)' }}>
                  {selectedTrace.agentName} (Step #{selectedTrace.stepIndex + 1})
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Run ID: {selectedTrace.runId} • Model: {selectedTrace.modelUsed || 'deterministic'}
                </div>
              </div>

              <button onClick={() => setSelectedTrace(null)} className="btn btn-outline btn-sm">
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {selectedTrace.reasoning && (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Agent Reasoning / Analysis
                  </div>
                  <div style={{
                    padding: '0.875rem',
                    borderRadius: '8px',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                  }}>
                    {selectedTrace.reasoning}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Output Payload
                </div>
                <pre style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-card)',
                  fontSize: '0.75rem',
                  overflowX: 'auto',
                  color: '#38bdf8',
                }}>
                  {JSON.stringify(selectedTrace.outputData, null, 2)}
                </pre>
              </div>

              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Input Data
                </div>
                <pre style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-card)',
                  fontSize: '0.75rem',
                  overflowX: 'auto',
                  color: '#e2e8f0',
                }}>
                  {JSON.stringify(selectedTrace.inputData, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
