import { useState } from "react";
import type { EdgeActionEvent, CdnOrigin, OriginMockResponse } from "../types/edge-actions";
import "./InputConfigurator.css";

interface Props {
  event: EdgeActionEvent;
  mockKvs: Record<string, string>;
  originMocks: Record<number, OriginMockResponse>;
  onChange: (event: EdgeActionEvent) => void;
  onJsonChange: (json: string) => void;
  onOriginMocksChange: (mocks: Record<number, OriginMockResponse>) => void;
}

type Tab = "request" | "origins" | "context" | "json";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

export function InputConfigurator({ event, mockKvs, originMocks, onChange, onJsonChange, onOriginMocksChange }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("request");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "request", label: "Request", icon: "📤" },
    { id: "origins", label: "Origins", icon: "🎯" },
    { id: "context", label: "Context", icon: "📦" },
    { id: "json", label: "Raw JSON", icon: "{ }" },
  ];

  return (
    <div className="input-config">
      <div className="input-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`input-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="input-tab-content">
        {activeTab === "request" && (
          <RequestTab event={event} onChange={onChange} />
        )}
        {activeTab === "origins" && (
          <OriginsTab event={event} onChange={onChange} originMocks={originMocks} onOriginMocksChange={onOriginMocksChange} />
        )}
        {activeTab === "context" && (
          <ContextTab event={event} onChange={onChange} />
        )}
        {activeTab === "json" && (
          <JsonTab event={event} kvs={mockKvs} onChange={onJsonChange} />
        )}
      </div>
    </div>
  );
}

function RequestTab({ event, onChange }: { event: EdgeActionEvent; onChange: (e: EdgeActionEvent) => void }) {
  const updateRequest = (patch: Partial<typeof event.request>) => {
    onChange({ ...event, request: { ...event.request, ...patch } });
  };

  return (
    <div className="tab-form">
      <div className="form-row">
        <label>Method</label>
        <select
          value={event.request.method}
          onChange={(e) => updateRequest({ method: e.target.value })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>URI</label>
        <input
          type="text"
          value={event.request.uri}
          onChange={(e) => updateRequest({ uri: e.target.value })}
          placeholder="/api/hello"
        />
      </div>
      <div className="form-row">
        <label>Query String</label>
        <input
          type="text"
          value={event.request.query_string}
          onChange={(e) => updateRequest({ query_string: e.target.value })}
          placeholder="key=value&foo=bar"
        />
      </div>
      <div className="form-row">
        <label>Body</label>
        <textarea
          value={event.request.body}
          onChange={(e) => updateRequest({ body: e.target.value })}
          placeholder="Request body (optional)"
          rows={3}
        />
      </div>
      <HeadersEditor
        headers={event.request.headers}
        onChange={(headers) => updateRequest({ headers })}
      />
    </div>
  );
}

function OriginsTab({
  event,
  onChange,
  originMocks,
  onOriginMocksChange,
}: {
  event: EdgeActionEvent;
  onChange: (e: EdgeActionEvent) => void;
  originMocks: Record<number, OriginMockResponse>;
  onOriginMocksChange: (mocks: Record<number, OriginMockResponse>) => void;
}) {
  const [expandedMock, setExpandedMock] = useState<number | null>(null);

  const addOrigin = () => {
    const newId = event.origin_data.length > 0 ? Math.max(...event.origin_data.map((o) => o.id)) + 1 : 0;
    onChange({
      ...event,
      origin_data: [
        ...event.origin_data,
        { id: newId, name: `origin-${newId}.myapp.net`, weight: 100, priority: 1, is_healthy: true },
      ],
    });
    // Auto-add a default mock for the new origin
    onOriginMocksChange({
      ...originMocks,
      [newId]: {
        statusCode: 200,
        headers: { "content-type": "application/json", "server": "nginx/1.25" },
        body: JSON.stringify({ message: `Response from origin-${newId}` }),
      },
    });
  };

  const updateOrigin = (index: number, patch: Partial<CdnOrigin>) => {
    const updated = [...event.origin_data];
    updated[index] = { ...updated[index], ...patch };
    onChange({ ...event, origin_data: updated });
  };

  const removeOrigin = (index: number) => {
    const removedId = event.origin_data[index].id;
    onChange({ ...event, origin_data: event.origin_data.filter((_, i) => i !== index) });
    const newMocks = { ...originMocks };
    delete newMocks[removedId];
    onOriginMocksChange(newMocks);
  };

  const updateMock = (originId: number, patch: Partial<OriginMockResponse>) => {
    const existing = originMocks[originId] || {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: "",
    };
    onOriginMocksChange({
      ...originMocks,
      [originId]: { ...existing, ...patch },
    });
  };

  return (
    <div className="tab-form">
      <div className="origins-table">
        {event.origin_data.map((origin, i) => {
          const mock = originMocks[origin.id];
          const isExpanded = expandedMock === origin.id;
          return (
            <div key={i} className="origin-entry">
              <div className="origin-row">
                <input
                  className="origin-field origin-name-field"
                  value={origin.name}
                  onChange={(e) => updateOrigin(i, { name: e.target.value })}
                  placeholder="Hostname (e.g. us.origin.com)"
                />
                <input
                  className="origin-field origin-num-field"
                  type="number"
                  value={origin.weight}
                  onChange={(e) => updateOrigin(i, { weight: Number(e.target.value) })}
                  title="Weight"
                />
                <input
                  className="origin-field origin-num-field"
                  type="number"
                  value={origin.priority}
                  onChange={(e) => updateOrigin(i, { priority: Number(e.target.value) })}
                  title="Priority"
                />
                <label className="origin-health-toggle">
                  <input
                    type="checkbox"
                    checked={origin.is_healthy}
                    onChange={(e) => updateOrigin(i, { is_healthy: e.target.checked })}
                  />
                  <span className="health-label">{origin.is_healthy ? "Healthy" : "Unhealthy"}</span>
                </label>
                <button
                  className={`btn-icon btn-mock-toggle ${isExpanded ? "active" : ""}`}
                  onClick={() => setExpandedMock(isExpanded ? null : origin.id)}
                  title="Configure mock response"
                >
                  🌐
                </button>
                <button className="btn-icon" onClick={() => removeOrigin(i)} title="Remove">✕</button>
              </div>

              {isExpanded && (
                <div className="origin-mock-config">
                  <div className="mock-config-header">Mock Response for {origin.name}</div>
                  <div className="mock-row">
                    <label>Status</label>
                    <input
                      type="number"
                      value={mock?.statusCode ?? 200}
                      onChange={(e) => updateMock(origin.id, { statusCode: Number(e.target.value) })}
                      min={100}
                      max={599}
                    />

                  </div>
                  <div className="mock-row-full">
                    <label>Body</label>
                    <textarea
                      value={mock?.body ?? ""}
                      onChange={(e) => updateMock(origin.id, { body: e.target.value })}
                      placeholder='{"message": "Hello from origin"}'
                      rows={3}
                    />
                  </div>
                  <div className="mock-row-full">
                    <label>Headers</label>
                    <div className="kv-table">
                      {Object.entries(mock?.headers ?? {}).map(([key, value], hi) => (
                        <div key={hi} className="kv-row">
                          <input
                            className="kv-key"
                            value={key}
                            onChange={(e) => {
                              const newHeaders: Record<string, string> = {};
                              for (const [k, v] of Object.entries(mock?.headers ?? {})) {
                                newHeaders[k === key ? e.target.value : k] = v;
                              }
                              updateMock(origin.id, { headers: newHeaders });
                            }}
                            placeholder="Header"
                          />
                          <input
                            className="kv-value"
                            value={value}
                            onChange={(e) => {
                              updateMock(origin.id, {
                                headers: { ...(mock?.headers ?? {}), [key]: e.target.value },
                              });
                            }}
                            placeholder="Value"
                          />
                          <button
                            className="btn-icon"
                            onClick={() => {
                              const newHeaders = { ...(mock?.headers ?? {}) };
                              delete newHeaders[key];
                              updateMock(origin.id, { headers: newHeaders });
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn btn-add btn-small"
                      onClick={() => {
                        updateMock(origin.id, {
                          headers: { ...(mock?.headers ?? {}), "": "" },
                        });
                      }}
                    >
                      + Add Header
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn btn-add" onClick={addOrigin}>+ Add Origin</button>
    </div>
  );
}

/** Common countries for the geo picker */
const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
];

function ContextTab({ event, onChange }: { event: EdgeActionEvent; onChange: (e: EdgeActionEvent) => void }) {
  const setContextKey = (key: string, value: string) => {
    onChange({ ...event, context: { ...event.context, [key]: value } });
  };

  const removeContextKey = (key: string) => {
    const newContext = { ...event.context };
    delete newContext[key];
    onChange({ ...event, context: newContext });
  };

  const countryCode = event.context.country_code ?? "";
  const isMobile = event.context.is_mobile === "1";

  return (
    <div className="tab-form">
      <div className="context-hint">
        Simulate the request metadata that Azure Front Door provides at the edge.
        Read via <code>event.context</code> in your handler —{" "}
        <strong>read-only</strong>, changes are discarded.
      </div>

      {/* Geo section */}
      <div className="context-section">
        <div className="context-section-label">🌍 Geography</div>
        <div className="context-field-row">
          <label className="context-field-label">Country</label>
          <select
            className="context-select"
            value={COUNTRIES.some(c => c.code === countryCode) ? countryCode : (countryCode ? "__custom" : "__none")}
            onChange={(e) => {
              if (e.target.value === "__none") {
                removeContextKey("country_code");
              } else if (e.target.value === "__custom") {
                setContextKey("country_code", "");
              } else {
                setContextKey("country_code", e.target.value);
              }
            }}
          >
            <option value="__none">— Not set —</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.code})</option>
            ))}
            <option value="__custom">Other…</option>
          </select>
          {countryCode && !COUNTRIES.some(c => c.code === countryCode) && (
            <input
              className="context-custom-input"
              value={countryCode}
              onChange={(e) => setContextKey("country_code", e.target.value.toUpperCase())}
              placeholder="ISO code (e.g. MX)"
              maxLength={2}
            />
          )}
        </div>
      </div>

      {/* Device section */}
      <div className="context-section">
        <div className="context-section-label">📱 Device</div>
        <div className="context-field-row">
          <label className="context-toggle-row">
            <span className="context-field-label">Mobile device</span>
            <button
              className={`context-toggle ${isMobile ? "active" : ""}`}
              onClick={() => {
                if (isMobile) {
                  removeContextKey("is_mobile");
                } else {
                  setContextKey("is_mobile", "1");
                }
              }}
              role="switch"
              aria-checked={isMobile}
            >
              <span className="context-toggle-track">
                <span className="context-toggle-thumb" />
              </span>
              <span className="context-toggle-label">{isMobile ? "Yes" : "No"}</span>
            </button>
          </label>
        </div>
      </div>
    </div>
  );
}

function JsonTab({ event, kvs, onChange }: { event: EdgeActionEvent; kvs: Record<string, string>; onChange: (json: string) => void }) {
  const fullJson = JSON.stringify({ event, mockKvs: kvs }, null, 2);

  return (
    <div className="tab-form json-tab">
      <textarea
        className="json-editor"
        value={fullJson}
        onChange={(e) => {
          try {
            const parsed = JSON.parse(e.target.value);
            if (parsed.event) {
              onChange(JSON.stringify(parsed.event));
            }
          } catch {
            // Invalid JSON, don't update
          }
        }}
        spellCheck={false}
      />
    </div>
  );
}

function HeadersEditor({
  headers,
  onChange,
}: {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
}) {
  const entries = Object.entries(headers);

  const addHeader = () => {
    onChange({ ...headers, "": "" });
  };

  const updateKey = (oldKey: string, newKey: string) => {
    const newHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      newHeaders[k === oldKey ? newKey : k] = v;
    }
    onChange(newHeaders);
  };

  const updateValue = (key: string, value: string) => {
    onChange({ ...headers, [key]: value });
  };

  const removeHeader = (key: string) => {
    const newHeaders = { ...headers };
    delete newHeaders[key];
    onChange(newHeaders);
  };

  return (
    <div className="headers-section">
      <div className="headers-title">Headers</div>
      <div className="kv-table">
        {entries.map(([key, value], i) => (
          <div key={i} className="kv-row">
            <input
              className="kv-key"
              value={key}
              onChange={(e) => updateKey(key, e.target.value)}
              placeholder="Header name"
            />
            <input
              className="kv-value"
              value={value}
              onChange={(e) => updateValue(key, e.target.value)}
              placeholder="Header value"
            />
            <button className="btn-icon" onClick={() => removeHeader(key)}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn btn-add btn-small" onClick={addHeader}>+ Add Header</button>
    </div>
  );
}
