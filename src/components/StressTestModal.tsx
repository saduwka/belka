import React, { useState } from 'react';
import BelkaStressTester, { StressTestResult } from '../utils/stressTest';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const StressTestModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(100);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<StressTestResult | null>(null);
  const [roundCount, setRoundCount] = useState(100);

  const runTest = async () => {
    setIsRunning(true);
    setResults(null);
    setProgress(0);

    const tester = new BelkaStressTester({ rounds: roundCount });
    tester.setProgressCallback((current, total, statusMsg) => {
      setProgress(current);
      setTotal(total);
      setStatus(statusMsg);
    });

    const result = await tester.run();
    setResults(result);
    setIsRunning(false);
  };

  if (!isOpen) return null;

  const successRate =
    results
      ? Math.round((results.completedRounds / results.totalRounds) * 100)
      : 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '24px',
          padding: '32px',
          maxWidth: '560px',
          width: '100%',
          margin: '0 16px',
          color: 'white',
          fontFamily: 'inherit',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
              🧪 СТРЕСС-ТЕСТ
            </h2>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '2px' }}>
              Engine Validator
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Idle state */}
        {!isRunning && !results && (
          <div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', lineHeight: '1.6', marginBottom: '20px' }}>
              Автоматический прогон раундов для поиска багов зависания,
              невалидных ходов и ошибок подсчёта очков.
            </p>

            {/* Round count picker */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '10px', fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
                КОЛИЧЕСТВО РАУНДОВ
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[50, 100, 500, 1000].map(n => (
                  <button
                    key={n}
                    onClick={() => setRoundCount(n)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '12px',
                      border: '1px solid',
                      borderColor: roundCount === n ? '#10b981' : 'rgba(255,255,255,0.1)',
                      background: roundCount === n ? 'rgba(16,185,129,0.15)' : 'transparent',
                      color: roundCount === n ? '#10b981' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                      fontWeight: 900,
                      fontSize: '13px',
                      transition: 'all 0.15s',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={runTest}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                border: 'none',
                color: 'white',
                padding: '16px',
                borderRadius: '16px',
                fontWeight: 900,
                fontSize: '13px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              ▶ Запустить {roundCount} раундов
            </button>
          </div>
        )}

        {/* Running state */}
        {isRunning && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{status}</span>
                <span style={{ fontWeight: 900, color: '#10b981', flexShrink: 0 }}>{progress} / {total}</span>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(progress / total) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #7c3aed, #10b981)',
                    borderRadius: '999px',
                    transition: 'width 0.1s',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.2)',
                  borderTopColor: '#7c3aed',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Тестирование... пожалуйста, подождите
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Results state */}
        {results && (
          <div>
            {/* Score cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <StatCard
                value={`${results.completedRounds}/${results.totalRounds}`}
                label="Завершено раундов"
                color={results.completedRounds === results.totalRounds ? '#10b981' : '#f59e0b'}
                bg="rgba(16,185,129,0.08)"
              />
              <StatCard
                value={`${results.avgRoundDuration.toFixed(0)}ms`}
                label="Среднее время раунда"
                color="#6366f1"
                bg="rgba(99,102,241,0.08)"
              />
              <StatCard
                value={String(results.hangs.length)}
                label="Зависаний"
                color={results.hangs.length === 0 ? '#10b981' : '#ef4444'}
                bg={results.hangs.length === 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'}
                emoji={results.hangs.length === 0 ? '✅' : '🐛'}
              />
              <StatCard
                value={String(results.errors.length)}
                label="Ошибок логики"
                color={results.errors.length === 0 ? '#10b981' : '#f59e0b'}
                bg={results.errors.length === 0 ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)'}
                emoji={results.errors.length === 0 ? '✅' : '❌'}
              />
            </div>

            {/* Success rate bar */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                <span>УСПЕШНОСТЬ</span>
                <span style={{ fontWeight: 900, color: successRate === 100 ? '#10b981' : '#f59e0b' }}>{successRate}%</span>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: '999px', height: '6px' }}>
                <div style={{ width: `${successRate}%`, height: '100%', background: successRate === 100 ? '#10b981' : '#f59e0b', borderRadius: '999px' }} />
              </div>
            </div>

            {/* Hang list */}
            {results.hangs.length > 0 && (
              <LogList
                title="🐛 Зависания"
                items={results.hangs.map(h =>
                  `Раунд ${h.roundNumber}: ${h.reason} [player=${h.state.currentPlayerIndex}, table=${h.state.tableLength}]`
                )}
                color="#ef4444"
                bg="rgba(239,68,68,0.06)"
              />
            )}

            {/* Error list */}
            {results.errors.length > 0 && (
              <LogList
                title="❌ Ошибки"
                items={results.errors.map(e => `Раунд ${e.roundNumber}: ${e.message}`)}
                color="#f59e0b"
                bg="rgba(245,158,11,0.06)"
              />
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={() => { setResults(null); setProgress(0); }}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  padding: '13px',
                  borderRadius: '14px',
                  fontWeight: 900,
                  fontSize: '11px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                ↺ Повторить
              </button>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  padding: '13px',
                  borderRadius: '14px',
                  fontWeight: 900,
                  fontSize: '11px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Helper sub-components ───────────────────────────────────────────────────

const StatCard: React.FC<{
  value: string;
  label: string;
  color: string;
  bg: string;
  emoji?: string;
}> = ({ value, label, color, bg, emoji }) => (
  <div style={{ background: bg, border: `1px solid ${color}22`, borderRadius: '14px', padding: '14px' }}>
    <div style={{ fontSize: '24px', fontWeight: 900, color, lineHeight: 1 }}>
      {emoji ? `${emoji} ` : ''}{value}
    </div>
    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>
      {label}
    </div>
  </div>
);

const LogList: React.FC<{
  title: string;
  items: string[];
  color: string;
  bg: string;
}> = ({ title, items, color, bg }) => (
  <div style={{ marginBottom: '14px' }}>
    <div style={{ fontSize: '11px', fontWeight: 900, color, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>
      {title} ({items.length})
    </div>
    <div style={{ background: bg, border: `1px solid ${color}22`, borderRadius: '12px', padding: '10px', maxHeight: '120px', overflowY: 'auto' }}>
      {items.slice(0, 10).map((item, i) => (
        <div key={i} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px', lineHeight: '1.4' }}>
          {item}
        </div>
      ))}
      {items.length > 10 && (
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
          ...и ещё {items.length - 10}
        </div>
      )}
    </div>
  </div>
);
