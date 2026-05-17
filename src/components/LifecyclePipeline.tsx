import { HookPoint, HookPointLabels } from "../types/edge-actions";
import "./LifecyclePipeline.css";

interface Props {
  activeHookPoint: number;
  onSelect: (hookPoint: number) => void;
  executedHookPoint?: number;
}

interface Stage {
  id: number;
  icon: string;
  desc: string;
  enabled: boolean;
}

const REQUEST_STAGES: Stage[] = [
  { id: HookPoint.ClientRequest, icon: "🌐", desc: "Modify request before routing", enabled: true },
  { id: HookPoint.OriginRequest, icon: "📤", desc: "Coming soon", enabled: false },
];

const RESPONSE_STAGES: Stage[] = [
  { id: HookPoint.OriginResponse, icon: "📥", desc: "Coming soon", enabled: false },
  { id: HookPoint.ClientResponse, icon: "📨", desc: "Coming soon", enabled: false },
];

function StageButton({ stage, activeHookPoint, executedHookPoint, onSelect }: {
  stage: Stage;
  activeHookPoint: number;
  executedHookPoint?: number;
  onSelect: (hookPoint: number) => void;
}) {
  return (
    <button
      className={`pipeline-stage ${activeHookPoint === stage.id ? "active" : ""} ${executedHookPoint === stage.id ? "executed" : ""} ${!stage.enabled ? "disabled" : ""}`}
      onClick={() => stage.enabled && onSelect(stage.id)}
      title={stage.desc}
      disabled={!stage.enabled}
    >
      <span className="stage-icon">{stage.icon}</span>
      <span className="stage-label">{HookPointLabels[stage.id]}</span>
    </button>
  );
}

export function LifecyclePipeline({ activeHookPoint, onSelect, executedHookPoint }: Props) {
  return (
    <div className="lifecycle-pipeline">
      <div className="pipeline-flow">
        <div className="pipeline-endpoint">👤 Client</div>
        <div className="pipeline-arrow">→</div>

        {REQUEST_STAGES.map((stage, i) => (
          <div key={stage.id} className="pipeline-stage-group">
            <StageButton stage={stage} activeHookPoint={activeHookPoint} executedHookPoint={executedHookPoint} onSelect={onSelect} />
            {i < REQUEST_STAGES.length - 1 && <div className="pipeline-arrow">→</div>}
          </div>
        ))}

        <div className="pipeline-arrow">→</div>
        <div className="pipeline-endpoint">🌐 Origin</div>
        <div className="pipeline-arrow">→</div>

        {RESPONSE_STAGES.map((stage, i) => (
          <div key={stage.id} className="pipeline-stage-group">
            <StageButton stage={stage} activeHookPoint={activeHookPoint} executedHookPoint={executedHookPoint} onSelect={onSelect} />
            {i < RESPONSE_STAGES.length - 1 && <div className="pipeline-arrow">→</div>}
          </div>
        ))}

        <div className="pipeline-arrow">→</div>
        <div className="pipeline-endpoint">👤 Client</div>
      </div>
    </div>
  );
}
