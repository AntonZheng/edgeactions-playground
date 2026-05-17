import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import { usePlaygroundStore } from "./store/playground-store";
import { EDGE_ACTIONS_DTS, HookPointLabels } from "./types/edge-actions";
import { LifecyclePipeline } from "./components/LifecyclePipeline";
import { OriginSimulation } from "./components/OriginSimulation";
import { ResponseModsPanel } from "./components/ResponseModsPanel";
import { InputConfigurator } from "./components/InputConfigurator";
import { TemplateSelector } from "./components/TemplateSelector";
import type * as MonacoType from "monaco-editor";
import "./App.css";

function App() {
  const store = usePlaygroundStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<typeof MonacoType | null>(null);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  useEffect(() => {
    store.loadFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handler diagnostics: warn if no `handler` function exists
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;
    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

    const content = store.code;
    const hasHandler = /function\s+handler\s*\(/.test(content);

    if (!hasHandler && content.trim().length > 0) {
      monaco.editor.setModelMarkers(model, "edge-actions", [
        {
          severity: monaco.MarkerSeverity.Error,
          message:
            'Missing "handler" function. Edge Actions require a function named "handler" that accepts an EdgeActionEvent and returns it.',
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        },
      ]);
    } else {
      monaco.editor.setModelMarkers(model, "edge-actions", []);
    }
  }, [store.code]);

  const handleEditorWillMount: BeforeMount = (monaco) => {
    // Register type definitions BEFORE model creation so IntelliSense is ready
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      checkJs: true,
      strict: false,
      allowJs: true,
      noLib: false,
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      EDGE_ACTIONS_DTS,
      "file:///edge_actions.d.ts"
    );
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register custom completion provider for Edge Actions patterns
    monaco.languages.registerCompletionItemProvider("javascript", {
      triggerCharacters: [".", "'", '"'],
      provideCompletionItems: (model: MonacoType.editor.ITextModel, position: MonacoType.Position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const suggestions: MonacoType.languages.CompletionItem[] = [];
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };

        // Snippets when typing "event."
        if (/event\.\s*$/.test(textUntilPosition)) {
          suggestions.push(
            {
              label: "request.headers['']",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "request.headers['${1:header-name}']",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Access a request header",
              range,
            },
            {
              label: "response.response_code",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "response.response_code = ${1:200}",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Set response status code",
              range,
            },
            {
              label: "origin.id",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "origin.id = ${1:0}",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Select an origin by ID",
              range,
            },
            {
              label: "request.uri",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "request.uri = '${1:/new/path}'",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Rewrite the request URL",
              range,
            },
            {
              label: "response.body",
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: "response.body = '${1:response body}'",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Override the response body",
              range,
            }
          );
        }

        // EdgeActionKvs snippet
        if (/EdgeActionKvs\.\s*$/.test(textUntilPosition) || /kvs\.\s*$/.test(textUntilPosition)) {
          suggestions.push({
            label: "getDefaultKeyValueStore().get('')",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "getDefaultKeyValueStore().get('${1:key}')",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Read from KV store",
            range,
          });
        }

        // Full handler template
        if (textUntilPosition.trim() === "" || /^\/?\*?\*?\s*$/.test(textUntilPosition)) {
          suggestions.push({
            label: "handler function (full template)",
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: [
              "/**",
              " * @param {EdgeActionEvent} event",
              " * @returns {EdgeActionEvent}",
              " */",
              "function handler(event) {",
              "    ${1:// Your edge action logic here}",
              "    return event;",
              "}",
            ].join("\n"),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Edge Action handler template",
            documentation: "Creates a complete handler function with JSDoc type annotations for IntelliSense",
            range,
          });
        }

        return { suggestions };
      },
    });

    // Ctrl+Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      usePlaygroundStore.getState().run();
    });
  };

  const statusColor =
    store.executionState === "success"
      ? "#4caf50"
      : store.executionState === "error"
        ? "#f44336"
        : store.executionState === "running"
          ? "#ff9800"
          : "#666";

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <svg className="header-icon" width="20" height="20" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.733,13.935l-.517-.509c.379-.587.606-1.282.623-2.029-.067-1.887-1.507-3.446-3.396-3.676-.069-2.089-1.449-3.829-3.33-4.47-.137-.618-.337-1.206-.602-1.224.004,0,.007-.002.011-.002.01,0,.02.003.03.005-.057-.022-.128-.041-.221-.046-.301-.017-.393-.006-.393-.006l-1.45.002c-.267,0-.483.215-.483.48l.002.69c-1.577.404-2.895,1.546-3.481,3.113C2.24,6.539.498,8.43.425,10.715c.042,1.092.457,2.082,1.117,2.856-.003.003-.006.006-.009.009-.26-.307-.483-.645-.658-1.012-.434.708-.914,1.617-.695,1.865-.003-.002-.006-.004-.009-.006-.007-.008-.012-.016-.018-.025.024.056.061.119.124.188.201.223.273.28.273.28l1.026,1.016c.189.187.495.187.683,0l1.03-1.029c.575.246,1.207.383,1.869.383.057,0,.114,0,.171-.003h1.722v-6.03h4.028v6.03h2.618c.035.005.071.007.106.007s.071-.002.106-.007c.601-.004,1.171-.142,1.681-.384.004.005.009.01.013.015-.309.148-.639.259-.986.324.794.547,1.487.946,1.651.808-.003.003-.004.007-.007.009-.008.007-.017.012-.025.018.056-.024.12-.061.189-.123.225-.2.282-.271.282-.271l1.024-1.018c.188-.187.188-.491,0-.678ZM13.907,14.649h-.04s-.039.006-.039.006c-.008.001-.015.002-.023.002s-.015,0-.023-.002l-.042-.006h-2.069v-6.03h-5.211v6.03h-1.151c-.05.002-.1.003-.15.003-.499,0-.976-.087-1.419-.246l.908-.907.619.612-.004-2.812-2.834.003.389.385s0,0,0,0l.281.274c-.074.09-.57.64-1.136,1.203-.557-.668-.907-1.516-.947-2.451.074-2,1.578-3.626,3.582-3.869l.357-.043.125-.335c.496-1.326,1.602-2.316,2.928-2.707l.007,2.063h-.874s2.006,1.987,2.006,1.987l2.002-1.99h-.55s0,.001,0,.001l-.394.003c-.015-.142-.075-1.228-.046-2.202.887.132,1.711.532,2.368,1.162.816.782,1.286,1.832,1.323,2.957l.017.502.503.061c1.604.195,2.811,1.497,2.876,3.098-.016.587-.182,1.132-.46,1.603l-1.459-1.438.617-.614-2.834.004.003,2.812.388-.386s0,0,0,0l.277-.279c.1.081.763.669,1.385,1.3-.387.156-.811.245-1.256.248ZM16.272,15.776c.002.005.004.01.006.015-.002-.005-.004-.01-.006-.015ZM16.297,15.856s0,.003,0,.004c0-.001,0-.003,0-.004Z" fill="currentColor"/>
          </svg>
          <h1>Edge Actions Playground</h1>
          <span className="subtitle">Azure Front Door — Serverless Edge Compute</span>
        </div>
        <div className="header-right">
          <button
            className="btn btn-templates"
            onClick={() => setShowTemplatePanel(!showTemplatePanel)}
          >
            📚 Templates
          </button>
          <button className="btn btn-share" onClick={() => store.share()}>
            🔗 Share
          </button>
          {store.shareNotification && (
            <span className="share-toast">{store.shareNotification}</span>
          )}
        </div>
      </header>

      {/* Lifecycle Pipeline */}
      <LifecyclePipeline
        activeHookPoint={store.inputEvent.hook_point}
        onSelect={(hp) => store.setHookPoint(hp)}
        executedHookPoint={store.output ? store.inputEvent.hook_point : undefined}
      />

      {/* Main Content */}
      <div className="main">
        {/* Template Panel (collapsible sidebar) */}
        {showTemplatePanel && (
          <div className="template-panel">
            <div className="panel-header">
              <span>📚 Scenarios</span>
              <button className="btn-icon" onClick={() => setShowTemplatePanel(false)}>✕</button>
            </div>
            <TemplateSelector onSelect={(i) => store.loadTemplate(i)} />
          </div>
        )}

        {/* Code Editor */}
        <div className="panel editor-panel">
          <div className="panel-header">
            <span>📝 edge_action.js</span>
            <span className="hint">Ctrl+Enter to run</span>
          </div>
          <Editor
            height="100%"
            defaultLanguage="javascript"
            value={store.code}
            onChange={(v) => store.setCode(v || "")}
            beforeMount={handleEditorWillMount}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              padding: { top: 12 },
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
            }}
          />
        </div>

        {/* Right Panel */}
        <div className="panel right-panel">
          {/* Input Configurator */}
          <div className="input-section">
            <div className="panel-header">
              <span>📥 Input Configuration</span>
              <span className="hook-badge">
                {HookPointLabels[store.inputEvent.hook_point] || "Unknown"}
              </span>
            </div>
            <InputConfigurator
              event={store.inputEvent}
              mockKvs={store.mockKvs}
              originMocks={store.originMocks}
              onChange={(e) => store.setInputEvent(e)}
              onJsonChange={(json) => store.setInputJson(json)}
              onOriginMocksChange={(mocks) => store.setOriginMocks(mocks)}
            />
          </div>

          {/* Run Bar */}
          <div className="run-bar">
            <button
              className="btn btn-run"
              onClick={() => store.run()}
              disabled={store.executionState === "running"}
            >
              {store.executionState === "running" ? "⏳ Running..." : "▶ Run"}
            </button>
            <span className="status" style={{ color: statusColor }}>
              ●{" "}
              {store.executionState === "idle"
                ? "Ready"
                : store.executionState === "running"
                  ? "Executing..."
                  : store.executionState === "success"
                    ? `Passed`
                    : "Error"}
            </span>
            <span className="provider-badge" title={store.provider.description}>
              🖥️ {store.provider.name}
            </span>
          </div>

          {/* Output Section */}
          <div className="output-section">
            {store.executionState === "error" && store.error && (
              <div className="error-display">
                <pre>{store.error}</pre>
              </div>
            )}

            {store.executionState === "success" && store.output && (
              <>
                {/* Output Tabs */}
                <div className="output-tabs">
                  <button
                    className={`output-tab ${store.activeOutputTab === "simulation" ? "active" : ""}`}
                    onClick={() => store.setActiveOutputTab("simulation")}
                  >
                    🌐 Simulation
                  </button>
                  <button
                    className={`output-tab ${store.activeOutputTab === "mods" ? "active" : ""}`}
                    onClick={() => store.setActiveOutputTab("mods")}
                  >
                    📋 Modifications
                  </button>
                  <button
                    className={`output-tab ${store.activeOutputTab === "diff" ? "active" : ""}`}
                    onClick={() => store.setActiveOutputTab("diff")}
                  >
                    ± Diff
                  </button>
                  <button
                    className={`output-tab ${store.activeOutputTab === "console" ? "active" : ""}`}
                    onClick={() => store.setActiveOutputTab("console")}
                  >
                    🖥️ Console {store.logs.length > 0 && `(${store.logs.length})`}
                  </button>
                </div>

                <div className="output-content">
                  {store.activeOutputTab === "simulation" && store.simulatedResponse && (
                    <OriginSimulation
                      simulation={store.simulatedResponse}
                      inputEvent={store.inputEvent}
                      output={store.output}
                      originMocks={store.originMocks}
                    />
                  )}
                  {store.activeOutputTab === "mods" && (
                    <ResponseModsPanel input={store.inputEvent} output={store.output} />
                  )}
                  {store.activeOutputTab === "diff" && (
                    <OutputDiff input={store.inputEvent} output={store.output} />
                  )}
                  {store.activeOutputTab === "console" && (
                    <ConsoleOutput logs={store.logs} />
                  )}
                </div>
              </>
            )}

            {store.executionState === "idle" && (
              <div className="placeholder">
                <div className="placeholder-icon">⚡</div>
                <div className="placeholder-text">
                  Click <strong>▶ Run</strong> or press <strong>Ctrl+Enter</strong> to execute your Edge Action
                </div>
                <div className="placeholder-hint">
                  Try a template from the 📚 Templates panel to get started
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsoleOutput({ logs }: { logs: Array<{ level: string; message: string }> }) {
  if (logs.length === 0) {
    return <div className="console-empty">No console output</div>;
  }

  return (
    <div className="console-output">
      {logs.map((log, i) => (
        <div key={i} className={`console-line console-${log.level}`}>
          <span className="console-level">[{log.level}]</span> {log.message}
        </div>
      ))}
    </div>
  );
}

function OutputDiff({ input, output }: { input: object; output: object }) {
  const changes = findChanges(input, output);

  if (changes.length === 0) {
    return <div className="no-changes">No changes made to the event</div>;
  }

  return (
    <div className="diff-view">
      {changes.map((change, i) => (
        <div key={i} className={`diff-line diff-${change.type}`}>
          <span className="diff-path">{change.path}</span>
          {change.type === "added" && (
            <span className="diff-value">+ {JSON.stringify(change.newValue)}</span>
          )}
          {change.type === "removed" && (
            <span className="diff-value">- {JSON.stringify(change.oldValue)}</span>
          )}
          {change.type === "changed" && (
            <span className="diff-value">
              {JSON.stringify(change.oldValue)} → {JSON.stringify(change.newValue)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface Change {
  path: string;
  type: "added" | "removed" | "changed";
  oldValue?: unknown;
  newValue?: unknown;
}

function findChanges(a: unknown, b: unknown, path = ""): Change[] {
  const changes: Change[] = [];

  if (a === b) return changes;
  if (typeof a !== typeof b || a === null || b === null) {
    changes.push({ path: path || "(root)", type: "changed", oldValue: a, newValue: b });
    return changes;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= a.length) {
        changes.push({ path: `${path}[${i}]`, type: "added", newValue: b[i] });
      } else if (i >= b.length) {
        changes.push({ path: `${path}[${i}]`, type: "removed", oldValue: a[i] });
      } else {
        changes.push(...findChanges(a[i], b[i], `${path}[${i}]`));
      }
    }
    return changes;
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);

    for (const key of allKeys) {
      const subPath = path ? `${path}.${key}` : key;
      if (!(key in aObj)) {
        changes.push({ path: subPath, type: "added", newValue: bObj[key] });
      } else if (!(key in bObj)) {
        changes.push({ path: subPath, type: "removed", oldValue: aObj[key] });
      } else {
        changes.push(...findChanges(aObj[key], bObj[key], subPath));
      }
    }
    return changes;
  }

  if (a !== b) {
    changes.push({ path: path || "(root)", type: "changed", oldValue: a, newValue: b });
  }

  return changes;
}

export default App;
