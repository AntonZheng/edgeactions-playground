import type { EdgeActionEvent } from "../types/edge-actions";
import "./ResponseModsPanel.css";

interface Props {
  input: EdgeActionEvent;
  output: EdgeActionEvent;
}

interface HeaderMod {
  key: string;
  value?: string;
  type: "added" | "updated" | "removed";
}

function computeHeaderMods(
  inputHeaders: Record<string, string>,
  outputHeaders: Record<string, string>
): HeaderMod[] {
  const mods: HeaderMod[] = [];
  const allKeys = new Set([...Object.keys(inputHeaders), ...Object.keys(outputHeaders)]);

  for (const key of allKeys) {
    if (!(key in inputHeaders) && key in outputHeaders) {
      mods.push({ key, value: outputHeaders[key], type: "added" });
    } else if (key in inputHeaders && !(key in outputHeaders)) {
      mods.push({ key, type: "removed" });
    } else if (inputHeaders[key] !== outputHeaders[key]) {
      mods.push({ key, value: outputHeaders[key], type: "updated" });
    }
  }

  return mods;
}

export function ResponseModsPanel({ input, output }: Props) {
  const requestHeaderMods = computeHeaderMods(input.request.headers, output.request.headers);
  const responseHeaderMods = computeHeaderMods(input.response.headers, output.response.headers);
  const urlChanged = input.request.uri !== output.request.uri;
  const statusChanged = output.response.response_code !== input.response.response_code && output.response.response_code !== 0;
  const bodyChanged = output.response.body !== input.response.body && output.response.body !== "";
  const originChanged = output.origin.id !== input.origin.id && output.origin.id >= 0;

  const hasChanges = requestHeaderMods.length > 0 || responseHeaderMods.length > 0 ||
    urlChanged || statusChanged || bodyChanged || originChanged;

  if (!hasChanges) {
    return (
      <div className="response-mods">
        <div className="mods-empty">No modifications — event passed through unchanged</div>
      </div>
    );
  }

  return (
    <div className="response-mods">
      <div className="mods-title">📋 What AFD Applies</div>

      {urlChanged && (
        <div className="mod-section">
          <div className="mod-section-title">URL Override</div>
          <div className="mod-item mod-changed">
            <span className="mod-key">uri</span>
            <span className="mod-arrow">→</span>
            <span className="mod-value">{output.request.uri}</span>
          </div>
        </div>
      )}

      {statusChanged && (
        <div className="mod-section">
          <div className="mod-section-title">Status Code</div>
          <div className="mod-item mod-changed">
            <span className="mod-key">response_code</span>
            <span className="mod-arrow">→</span>
            <span className="mod-value">{output.response.response_code}</span>
          </div>
        </div>
      )}

      {originChanged && (
        <div className="mod-section">
          <div className="mod-section-title">Origin Routing</div>
          <div className="mod-item mod-changed">
            <span className="mod-key">origin.id</span>
            <span className="mod-arrow">→</span>
            <span className="mod-value">
              {output.origin.id}
              {input.origin_data.find((o) => o.id === output.origin.id)
                ? ` (${input.origin_data.find((o) => o.id === output.origin.id)!.name})`
                : " (unknown)"}
            </span>
          </div>
        </div>
      )}

      {requestHeaderMods.length > 0 && (
        <div className="mod-section">
          <div className="mod-section-title">Request Headers</div>
          {requestHeaderMods.map((mod) => (
            <div key={mod.key} className={`mod-item mod-${mod.type}`}>
              <span className="mod-badge">{mod.type === "added" ? "+" : mod.type === "removed" ? "−" : "~"}</span>
              <span className="mod-key">{mod.key}</span>
              {mod.value !== undefined && (
                <>
                  <span className="mod-arrow">:</span>
                  <span className="mod-value">{mod.value}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {responseHeaderMods.length > 0 && (
        <div className="mod-section">
          <div className="mod-section-title">Response Headers</div>
          {responseHeaderMods.map((mod) => (
            <div key={mod.key} className={`mod-item mod-${mod.type}`}>
              <span className="mod-badge">{mod.type === "added" ? "+" : mod.type === "removed" ? "−" : "~"}</span>
              <span className="mod-key">{mod.key}</span>
              {mod.value !== undefined && (
                <>
                  <span className="mod-arrow">:</span>
                  <span className="mod-value">{mod.value}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {bodyChanged && (
        <div className="mod-section">
          <div className="mod-section-title">Response Body</div>
          <div className="mod-item mod-changed">
            <span className="mod-value mod-body">{output.response.body.slice(0, 200)}{output.response.body.length > 200 ? "..." : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
