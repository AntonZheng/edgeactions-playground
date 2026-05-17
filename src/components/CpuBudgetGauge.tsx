import "./CpuBudgetGauge.css";

interface Props {
  durationMs: number | null;
  budgetMs?: number;
}

export function CpuBudgetGauge({ durationMs, budgetMs = 5 }: Props) {
  if (durationMs === null) return null;

  const percentage = Math.min((durationMs / budgetMs) * 100, 120);
  const level =
    durationMs > budgetMs
      ? "over"
      : durationMs > budgetMs * 0.8
        ? "danger"
        : durationMs > budgetMs * 0.4
          ? "warning"
          : "safe";

  return (
    <div className="cpu-gauge">
      <div className="gauge-header">
        <span className="gauge-label">⏱ CPU Time</span>
        <span className={`gauge-value gauge-${level}`}>
          {durationMs.toFixed(2)}ms / {budgetMs}ms
        </span>
      </div>
      <div className="gauge-bar-track">
        <div
          className={`gauge-bar-fill gauge-${level}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
        {percentage > 100 && (
          <div className="gauge-overflow" style={{ width: `${Math.min(percentage - 100, 20)}%` }} />
        )}
      </div>
      <div className="gauge-markers">
        <span>0ms</span>
        <span className="gauge-budget-mark">|</span>
        <span>{budgetMs}ms budget</span>
      </div>
      {level === "over" && (
        <div className="gauge-warning">
          ⚠️ Over budget! In production, this action would be terminated.
        </div>
      )}
      <div className="gauge-note">
        Times are approximate — production uses the same QuickJS engine in a Hyperlight micro-VM.
      </div>
    </div>
  );
}
