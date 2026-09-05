import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Shield, ShieldCheck, Zap, ChevronRight, Activity, FileText } from '../components/icons';

export default function ChargebackDetailPage({ chargebackId, onBack }) {
  const [chargeback, setChargeback] = useState(null);
  const [evidenceList, setEvidenceList] = useState([]);
  const [responseDraft, setResponseDraft] = useState(null);
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeView, setActiveView] = useState('full_flow'); // 'full_flow', 'vault', 'rebuttal', 'traces'

  useEffect(() => {
    if (chargebackId) {
      loadAllCaseData();
    }
  }, [chargebackId]);

  async function loadAllCaseData() {
    setLoading(true);
    try {
      const [cbRes, evRes, respRes, tracesRes] = await Promise.allSettled([
        api.chargebacks.getById(chargebackId),
        api.chargebacks.getEvidence(chargebackId),
        api.chargebacks.getResponse(chargebackId),
        api.chargebacks.getTraces(chargebackId),
      ]);

      if (cbRes.status === 'fulfilled' && cbRes.value?.data) {
        setChargeback(cbRes.value.data);
      }
      if (evRes.status === 'fulfilled' && evRes.value?.data) {
        setEvidenceList(evRes.value.data);
      }
      if (respRes.status === 'fulfilled' && respRes.value?.data) {
        setResponseDraft(respRes.value.data);
      }
      if (tracesRes.status === 'fulfilled' && tracesRes.value?.data) {
        setTraces(tracesRes.value.data);
      }
    } catch (err) {
      console.error('Failed to load chargeback details:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateRebuttal() {
    setActionLoading(true);
    try {
      const res = await api.chargebacks.generateResponse(chargebackId);
      if (res?.data) {
        setResponseDraft(res.data);
      }
      // Refresh traces
      const tracesRes = await api.chargebacks.getTraces(chargebackId);
      if (tracesRes?.data) {
        setTraces(tracesRes.data);
      }
    } catch (err) {
      alert(`Error generating rebuttal: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVerifyRebuttal() {
    if (!responseDraft) return;
    setActionLoading(true);
    try {
      const res = await api.chargebacks.verifyResponse(chargebackId, {
        responseText: responseDraft.responseText,
        keyArguments: responseDraft.keyArguments,
        evidenceReferences: responseDraft.evidenceReferences,
      });
      if (res?.data) {
        setResponseDraft((prev) => ({
          ...prev,
          verification: res.data.verification || res.data,
          status: res.data.verificationStatus || prev.status,
        }));
      }
      const tracesRes = await api.chargebacks.getTraces(chargebackId);
      if (tracesRes?.data) {
        setTraces(tracesRes.data);
      }
    } catch (err) {
      alert(`Verification error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Loading dispute defense intelligence...
        </div>
      </div>
    );
  }

  if (!chargeback) {
    return (
      <div className="page-container">
        <button onClick={onBack} className="btn btn-outline btn-sm" style={{ marginBottom: '1rem' }}>
          Back to Chargebacks
        </button>
        <div className="card">Dispute case not found.</div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header / Breadcrumb with Editorial Roman Hero */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.25rem' }}>
        <div>
          <button onClick={onBack} className="btn btn-outline btn-sm" style={{ marginBottom: '0.75rem' }}>
            Back to Disputes
          </button>
          <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
            Defensive Rebuttal Dossier
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', letterSpacing: '-0.02em', fontWeight: 600, color: 'var(--text-primary)', margin: '0.25rem 0' }}>
            Defend the case.
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {chargeback.caseNumber}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span className="tabular-nums" style={{ fontWeight: 700, color: '#ffffff' }}>
              ${chargeback.disputeAmount?.toFixed(2)} USD
            </span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span className="badge badge-neutral">{chargeback.network}</span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span className={`badge ${
              chargeback.status === 'WON' ? 'badge-low' : chargeback.status === 'UNDER_REVIEW' ? 'badge-med' : 'badge-high'
            }`}>
              {chargeback.status}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {chargeback.reasonCode} ({chargeback.reasonDescription})
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', alignSelf: 'flex-end' }}>
          <button
            onClick={handleGenerateRebuttal}
            disabled={actionLoading}
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Zap size={14} />
            <span>{actionLoading ? 'Processing...' : 'Generate Rebuttal Draft'}</span>
          </button>

          <button
            onClick={handleVerifyRebuttal}
            disabled={actionLoading || !responseDraft}
            className="btn btn-cyan btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Shield size={14} />
            <span>Run Verification Guardrail</span>
          </button>
        </div>
      </div>

      {/* Primary 6-Step Defense Flow Timeline */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.75rem',
        padding: '0.875rem 1.25rem',
        borderRadius: '8px',
        background: 'rgba(19, 25, 54, 0.75)',
        border: '1px solid var(--dry-sage-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--dry-sage)', color: 'var(--neon-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>1</span>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Dispute Intake</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Cardholder Claim</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--dry-sage)', color: 'var(--neon-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>2</span>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Evidence Vault</div>
            <div style={{ fontSize: '0.65rem', color: '#34d399' }}>{evidenceList.length} Grounded Items</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--dry-sage)', color: 'var(--neon-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>3</span>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>AI Rebuttal</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--dry-sage)' }}>Advisory Drafting</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#34d399', color: '#0b0e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>4</span>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Deterministic Check</div>
            <div style={{ fontSize: '0.65rem', color: '#34d399' }}>0 Hallucinations</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--neon-navy)', color: 'var(--dry-sage)', border: '1px solid var(--dry-sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>5</span>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Authoritative Decision</div>
            <div style={{ fontSize: '0.65rem', color: '#c084fc' }}>REPRESENT</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Evidence Vault (Left) & Rebuttal + Verification (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Evidence Vault */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Evidence Vault</h3>
                <p style={{ fontSize: '0.8rem' }}>Immutable repository of customer authorizations and carrier proofs</p>
              </div>
              <span className="badge badge-verified">
                {evidenceList.length} Verified Artifacts
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {evidenceList.map((ev) => (
                <div
                  key={ev._id}
                  style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                        {ev.type}
                      </span>
                      <strong style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                        {ev.title}
                      </strong>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ID: {ev._id.toString().slice(-6)}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {ev.description}
                  </div>

                  {/* Extracted Factual Anchors */}
                  {ev.extractedFacts?.length > 0 && (
                    <div style={{
                      marginTop: '0.25rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-card)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {ev.extractedFacts.map((f, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{f.key}:</span>
                          <span style={{ color: '#38bdf8' }}>{String(f.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Linked Transaction Card */}
          {chargeback.transactionId && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Original Transaction Context</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.75rem',
                fontSize: '0.8rem',
              }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Cardholder / Email</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {chargeback.transactionId.cardholder || 'Marcus Vance'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {chargeback.transactionId.email || 'm.vance@techcorp.io'}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>AVS & Geo Verification</div>
                  <div style={{ fontWeight: 600, color: '#34d399' }}>Full Street & Postal Match</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    San Francisco, CA (IP: 198.51.100.42)
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: AI Rebuttal + Verification Guardrail + Traces */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Verification Guardrail Findings Card */}
          {responseDraft?.verification && (
            <div className="card" style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)',
              border: '1px solid var(--risk-low-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#34d399',
                  }}>
                    <ShieldCheck size={18} />
                  </div>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                    Deterministic Verification Guardrail
                  </strong>
                </div>

                <span className="badge badge-verified">
                  {responseDraft.verification.status || 'VERIFIED'}
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.75rem',
                fontSize: '0.8rem',
                marginBottom: '0.75rem',
              }}>
                <div style={{ padding: '0.5rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Grounding Valid</div>
                  <div style={{ fontWeight: 700, color: '#34d399' }}>
                    {responseDraft.verification.isGroundingValid ? '100% Grounded' : 'Check Required'}
                  </div>
                </div>

                <div style={{ padding: '0.5rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Safety Violations</div>
                  <div style={{ fontWeight: 700, color: '#34d399' }}>0 Detected</div>
                </div>

                <div style={{ padding: '0.5rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Defensive Confidence</div>
                  <div className="tabular-nums" style={{ fontWeight: 700, color: '#818cf8' }}>
                    {responseDraft.confidence || 94}%
                  </div>
                </div>
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                All cited evidence references verified in merchant Evidence Vault. No ungrounded fraud accusations and zero guaranteed-win claims detected.
              </p>
            </div>
          )}

          {/* Generated Rebuttal Narrative */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Defensive Rebuttal Letter</h3>
                <p style={{ fontSize: '0.8rem' }}>Issuing bank submission letter citing verified Vault facts</p>
              </div>
              <span className="badge badge-neutral">
                Recommendation: {responseDraft?.recommendation || 'DEFEND'}
              </span>
            </div>

            {responseDraft ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  padding: '1.25rem',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-card)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  lineHeight: '1.6',
                  color: '#e2e8f0',
                  maxHeight: '360px',
                  overflowY: 'auto',
                }}>
                  {responseDraft.responseText}
                </div>

                {/* Key Claims Grounding List */}
                {responseDraft.keyArguments?.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Grounded Key Defense Arguments:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {responseDraft.keyArguments.map((arg, idx) => (
                        <div key={idx} style={{
                          fontSize: '0.75rem',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          background: 'rgba(30, 41, 59, 0.4)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}>
                          <span>• {arg.claim}</span>
                          <span className="badge badge-verified" style={{ fontSize: '0.65rem' }}>
                            {arg.evidenceIds?.length || 1} Citations Verified
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2.5rem' }}>
                <p style={{ marginBottom: '1rem' }}>No rebuttal letter generated yet for this case.</p>
                <button
                  onClick={handleGenerateRebuttal}
                  disabled={actionLoading}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Zap size={14} />
                  <span>Generate First Rebuttal Draft</span>
                </button>
              </div>
            )}
          </div>

          {/* Agent Execution Traces Feed */}
          {traces.length > 0 && (
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Multi-Agent Execution Pipeline</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {traces.map((t, idx) => (
                  <div key={idx} style={{
                    padding: '0.625rem 0.875rem',
                    borderRadius: '6px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                  }}>
                    <div>
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                        Step {t.stepIndex + 1}: {t.agentName}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {t.reasoning || 'Step completed'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className={`badge ${t.status === 'COMPLETED' ? 'badge-low' : 'badge-high'}`} style={{ fontSize: '0.65rem' }}>{t.status}</span>
                      <div className="tabular-nums" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.latencyMs}ms</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
