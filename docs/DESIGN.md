# Edge Actions Playground — Design Document

## Overview

The Edge Actions Playground is a **fully client-side** browser application that lets developers write, test, and share Azure Front Door Edge Actions handlers without deploying to production. It simulates the Edge Actions request lifecycle locally using a WASM-based JavaScript runtime.

**Live:** https://antonzheng.github.io/edgeactions-playground/

---

## Architecture

```mermaid
graph TD
    subgraph Browser["Browser (Single Page Application)"]
        Editor["Monaco Editor<br/>(handler.js)"]
        Input["Input Configurator<br/>(Event JSON)"]
        Output["Output Panels<br/>(Simulation / Mods / Console)"]

        Store["Zustand Store<br/>code + inputEvent + originMocks"]
        Executor["Execution Provider<br/>QuickJS-emscripten (WASM)"]
        Sim["Simulation Engine<br/>computeSimulatedResponse()"]

        Editor --> Store
        Input --> Store
        Store --> Executor
        Executor --> Sim
        Sim --> Output
    end

    style Browser fill:#1a1a2e,stroke:#16213e,color:#eee
    style Executor fill:#0f3460,stroke:#533483,color:#eee
    style Sim fill:#0f3460,stroke:#533483,color:#eee
```

> [!NOTE]
> No backend, no network calls. Everything runs in-browser — the app works offline after initial load.

---

## Request Lifecycle

```mermaid
sequenceDiagram
    participant Client
    participant Playground as Playground (Browser)
    participant QuickJS as QuickJS WASM
    participant SimEngine as Simulation Engine

    Client->>Playground: Click "Run"
    Playground->>QuickJS: Execute handler(event)
    QuickJS-->>Playground: Modified event
    Playground->>SimEngine: computeSimulatedResponse(input, output, mocks)

    alt Handler set response_code (no origin selected)
        SimEngine-->>Playground: Synthetic response (blocked)
    else Handler selected origin
        SimEngine-->>Playground: Origin mock response + handler mods
    else No origin selection
        SimEngine-->>Playground: AFD weighted routing + handler mods
    end

    Playground-->>Client: Display final response
```

---

## Key Components

### 1. Code Editor (`App.tsx` + Monaco)

- Monaco Editor configured for JavaScript with custom IntelliSense
- TypeScript definitions (`EDGE_ACTIONS_DTS`) registered as ambient declarations via `addExtraLib`
- DTS registered in `beforeMount` (before model creation) with URI `ts:edge_actions.d.ts`
- Custom autocomplete snippets for common patterns (header manipulation, URL rewrite)
- File path set to `handler.js` for proper JS language service

### 2. Execution Engine (`src/executor/`)

**Strategy pattern** with pluggable providers:

```typescript
interface ExecutionProvider {
  name: string;
  execute(code: string, event: EdgeActionEvent): Promise<ExecutionResult>;
}
```

**LocalProvider (current):**
- Uses [quickjs-emscripten](https://github.com/nicolo-ribaudo/quickjs-emscripten) — QuickJS compiled to WASM
- Executes handler code in a sandboxed QuickJS context
- Injects `console` object that captures logs
- Serializes `EdgeActionEvent` into the sandbox, calls `handler(event)`, deserializes result

**Why QuickJS-WASM?**
- Runs entirely in-browser — no server needed
- True JavaScript engine (not `eval`) with proper sandboxing
- Close enough to production behavior for handler logic testing
- ~1-1.5MB WASM payload (acceptable for a dev tool)

> [!IMPORTANT]
> Production uses [Hyperlight](https://github.com/hyperlight-dev/hyperlight) micro-VM sandboxes. Performance characteristics differ — QuickJS is interpreter-based while Hyperlight uses ahead-of-time compilation. CPU budget enforcement is not simulated.

### 3. Simulation Engine (`playground-store.ts :: computeSimulatedResponse`)

After executing the handler, the simulation engine models what Azure Front Door + the origin would do in production:

- **Synthetic response (block)** — Handler sets `response_code` without selecting an origin → request terminated at edge, no origin contacted
- **Origin selection** — Handler explicitly picks an origin via `origin.id`, or AFD default weighted routing is simulated
- **Response merging** — Origin mock provides base response; handler's status code and headers override/merge on top

> [!WARNING]
> Body override (`response.body`) is defined in the contract but not yet implemented in production. The Actor Agent hardcodes `body_override: None`. Handler body modifications are silently discarded.

### 4. Input Configuration (`InputConfigurator.tsx`)

Tabbed editor for the full `EdgeActionEvent` input:

| Tab | Edits |
|-----|-------|
| **Request** | URI, method, headers |
| **Origins** | Origin list (name, weight, priority, health) |
| **Context** | Key-value metadata (country_code, is_mobile, etc.) |
| **Raw JSON** | Direct JSON editing of the event |

### 5. Output Panels

| Panel | Shows |
|-------|-------|
| **Simulation** | Final HTTP response (status, headers, body), which origin was selected and why |
| **Mods** | Diff view of what the handler changed (URL rewrites, header additions, status override) |
| **Console** | Handler's `console.log/warn/error` output |

### 6. Origin Simulation (`OriginSimulation.tsx`)

Displays how the request would be routed:
- **Routing method**: `handler` (explicit selection), `weighted` (AFD default), or `synthetic` (blocked, no origin)
- **Origin grid**: Shows all configured origins with health status; highlights the selected one
- **Mock responses**: Each origin has a configurable mock response (status, headers, body)

---

## Data Model

### EdgeActionEvent (mirrors production contract)

```typescript
interface EdgeActionEvent {
  request: { uri, method, query_string, headers, body }
  origin_data: Array<{ id, name, weight, priority, is_healthy }>
  response: { response_code, headers, body, set_cookie_headers }
  hook_point: number          // 0=ClientRequest (only one supported today)
  context: Record<string, string>  // Read-only edge metadata
  origin: { id: number }      // Handler sets this to select an origin
}
```

---

## Future Considerations

1. **Remote execution provider** — Optional POST to a Hyperlight sandbox API for production-accurate execution timing and CPU budget enforcement.

2. **Shared type package** — Extract `EdgeActionEvent` types to an npm package generated from the Rust contracts (via `ts-rs`) to prevent drift between playground, VS Code extension, and production.

3. **Body override support** — When Actor Agent implements `body_override` / `is_body_modified`, update the simulation to use handler-set body.

4. **Additional hook points** — When `OriginResponse` and `ClientResponse` hooks go live, the simulation pipeline will need to chain multiple handler invocations.
