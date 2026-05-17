import type { SimulatedResponse } from "../store/playground-store";
import type { EdgeActionEvent, OriginMockResponse } from "../types/edge-actions";
import "./OriginSimulation.css";

interface Props {
  simulation: SimulatedResponse;
  inputEvent: EdgeActionEvent;
  output: EdgeActionEvent;
  originMocks: Record<number, OriginMockResponse>;
}

export function OriginSimulation({ simulation, inputEvent, output, originMocks }: Props) {
  const statusClass =
    simulation.statusCode >= 500
      ? "status-5xx"
      : simulation.statusCode >= 400
        ? "status-4xx"
        : simulation.statusCode >= 300
          ? "status-3xx"
          : "status-2xx";

  // Compute diffs for the inline "What Changed" section
  const diffs = computeDiffs(inputEvent, output);

  return (
    <div className="origin-sim">
      {/* Response Status Bar */}
      <div className={`sim-status-bar ${statusClass}`}>
        <span className="sim-status-code">
          {simulation.statusCode} {httpStatusText(simulation.statusCode)}
        </span>

      </div>

      {/* What Changed — inline diff */}
      {diffs.length > 0 && (
        <div className="sim-diff-section">
          <div className="sim-label">What Changed</div>
          <div className="sim-diff-list">
            {diffs.map((d, i) => (
              <div key={i} className={`sim-diff-row sim-diff-${d.type}`}>
                <span className="sim-diff-badge">
                  {d.type === "added" ? "+" : d.type === "removed" ? "−" : "~"}
                </span>
                <span className="sim-diff-field">{d.field}</span>
                {d.oldVal !== undefined && (
                  <span className="sim-diff-old">{d.oldVal}</span>
                )}
                {d.oldVal !== undefined && d.newVal !== undefined && (
                  <span className="sim-diff-arrow">→</span>
                )}
                {d.newVal !== undefined && (
                  <span className="sim-diff-new">{d.newVal}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Origins — compact grid */}
      {inputEvent.origin_data.length > 0 && (
        <div className="sim-origins-section">
          <div className="sim-label">
            Origin
            <span className="sim-routing-method">
              {simulation.routingMethod === "handler" ? "selected by handler" : "AFD weighted routing"}
            </span>
          </div>
          <div className="sim-origins-grid">
            {inputEvent.origin_data.map((origin) => {
              const isSelected = origin.id === simulation.selectedOriginId;
              const mock = originMocks[origin.id];
              return (
                <div
                  key={origin.id}
                  className={`sim-origin-chip ${isSelected ? "selected" : ""} ${!origin.is_healthy ? "unhealthy" : ""}`}
                >
                  <div className="sim-origin-top">
                    <span className="sim-origin-name">{origin.name}</span>
                    {isSelected && <span className="sim-origin-tag">▶</span>}
                    <span className={`sim-origin-dot ${origin.is_healthy ? "h" : "u"}`}>●</span>
                  </div>
                  {mock && (
                    <div className="sim-origin-detail">
                      <span className={`sim-origin-status ${mock.statusCode >= 400 ? "err" : "ok"}`}>{mock.statusCode}</span>

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Response Headers */}
      {Object.keys(simulation.headers).length > 0 && (
        <div className="sim-headers-section">
          <div className="sim-label">Response Headers</div>
          <div className="sim-headers-list">
            {Object.entries(simulation.headers).map(([key, value]) => {
              const isFromHandler = output.response.headers[key] !== undefined;
              return (
                <div key={key} className={`sim-header ${isFromHandler ? "from-handler" : "from-origin"}`}>
                  <span className="sim-hdr-key">{key}:</span>
                  <span className="sim-hdr-val">{value}</span>
                  <span className="sim-hdr-src">{isFromHandler ? "handler" : "origin"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Response Body */}
      {simulation.body && (
        <div className="sim-body-section">
          <div className="sim-label">Response Body</div>
          <pre className="sim-body-pre">{formatBody(simulation.body)}</pre>
        </div>
      )}
    </div>
  );
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function httpStatusText(code: number): string {
  const map: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  };
  return map[code] || "";
}

interface DiffItem {
  field: string;
  type: "added" | "changed" | "removed";
  oldVal?: string;
  newVal?: string;
}

function computeDiffs(input: EdgeActionEvent, output: EdgeActionEvent): DiffItem[] {
  const diffs: DiffItem[] = [];

  // URL change
  if (input.request.uri !== output.request.uri) {
    diffs.push({ field: "request.uri", type: "changed", oldVal: input.request.uri, newVal: output.request.uri });
  }

  // Status code change
  if (output.response.response_code !== input.response.response_code && output.response.response_code > 0) {
    diffs.push({ field: "response.status", type: "changed", oldVal: String(input.response.response_code), newVal: String(output.response.response_code) });
  }

  // Origin selection
  if (output.origin.id !== input.origin.id && output.origin.id >= 0) {
    const originName = input.origin_data.find((o) => o.id === output.origin.id)?.name ?? `ID ${output.origin.id}`;
    diffs.push({ field: "origin", type: "changed", oldVal: "default routing", newVal: originName });
  }

  // Request header diffs
  const allReqKeys = new Set([...Object.keys(input.request.headers), ...Object.keys(output.request.headers)]);
  for (const k of allReqKeys) {
    if (!(k in input.request.headers) && k in output.request.headers) {
      diffs.push({ field: `req.${k}`, type: "added", newVal: output.request.headers[k] });
    } else if (k in input.request.headers && !(k in output.request.headers)) {
      diffs.push({ field: `req.${k}`, type: "removed", oldVal: input.request.headers[k] });
    } else if (input.request.headers[k] !== output.request.headers[k]) {
      diffs.push({ field: `req.${k}`, type: "changed", oldVal: input.request.headers[k], newVal: output.request.headers[k] });
    }
  }

  // Response header diffs
  const allResKeys = new Set([...Object.keys(input.response.headers), ...Object.keys(output.response.headers)]);
  for (const k of allResKeys) {
    if (!(k in input.response.headers) && k in output.response.headers) {
      diffs.push({ field: `res.${k}`, type: "added", newVal: output.response.headers[k] });
    } else if (k in input.response.headers && !(k in output.response.headers)) {
      diffs.push({ field: `res.${k}`, type: "removed", oldVal: input.response.headers[k] });
    } else if (input.response.headers[k] !== output.response.headers[k]) {
      diffs.push({ field: `res.${k}`, type: "changed", oldVal: input.response.headers[k], newVal: output.response.headers[k] });
    }
  }

  // Response body change
  if (output.response.body !== input.response.body && output.response.body !== "") {
    diffs.push({ field: "response.body", type: "changed", newVal: output.response.body.length > 60 ? output.response.body.slice(0, 60) + "…" : output.response.body });
  }

  return diffs;
}
