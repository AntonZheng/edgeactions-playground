import { create } from "zustand";
import type { EdgeActionEvent, OriginMockResponse } from "../types/edge-actions";
import { defaultOriginMocks } from "../types/edge-actions";
import { LocalExecutionProvider, type ConsoleEntry, type ExecutionResult, type ExecutionProvider } from "../executor";
import { templates } from "../templates/scenarios";
import { decodeState, copyShareUrl } from "../utils/share";

/** The computed final response the client would see after the full pipeline */
export interface SimulatedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  selectedOriginId: number;
  selectedOriginName: string;
  routingMethod: "handler" | "weighted" | "synthetic";
}

interface PlaygroundState {
  // Editor
  code: string;

  // Input
  inputEvent: EdgeActionEvent;
  mockKvs: Record<string, string>;
  originMocks: Record<number, OriginMockResponse>;

  // Execution
  executionState: "idle" | "running" | "success" | "error";
  output: EdgeActionEvent | null;
  logs: ConsoleEntry[];
  error: string | null;
  durationMs: number | null;
  simulatedResponse: SimulatedResponse | null;

  // Provider
  provider: ExecutionProvider;

  // UI
  shareNotification: string | null;
  showTemplates: boolean;
  activeOutputTab: "simulation" | "mods" | "origins" | "diff" | "console";

  // Actions
  setCode: (code: string) => void;
  setInputEvent: (event: EdgeActionEvent) => void;
  setInputJson: (json: string) => void;
  setMockKvs: (kvs: Record<string, string>) => void;
  setOriginMocks: (mocks: Record<number, OriginMockResponse>) => void;
  setHookPoint: (hookPoint: number) => void;
  run: () => Promise<void>;
  loadTemplate: (index: number) => void;
  share: () => void;
  loadFromUrl: () => void;
  setShowTemplates: (show: boolean) => void;
  setActiveOutputTab: (tab: PlaygroundState["activeOutputTab"]) => void;
}

const DEFAULT_TEMPLATE = templates[0];

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  code: DEFAULT_TEMPLATE.code,
  inputEvent: DEFAULT_TEMPLATE.input,
  mockKvs: DEFAULT_TEMPLATE.kvs || {},
  originMocks: DEFAULT_TEMPLATE.originMocks || defaultOriginMocks(),

  executionState: "idle",
  output: null,
  logs: [],
  error: null,
  durationMs: null,
  simulatedResponse: null,

  provider: new LocalExecutionProvider(),

  shareNotification: null,
  showTemplates: false,
  activeOutputTab: "simulation",

  setCode: (code) => set({ code }),

  setInputEvent: (event) => set({ inputEvent: event }),

  setInputJson: (json: string) => {
    try {
      const event = JSON.parse(json) as EdgeActionEvent;
      set({ inputEvent: event });
    } catch {
      // Invalid JSON — don't update
    }
  },

  setMockKvs: (kvs) => set({ mockKvs: kvs }),

  setOriginMocks: (mocks) => set({ originMocks: mocks }),

  setHookPoint: (hookPoint: number) => {
    const { inputEvent } = get();
    set({ inputEvent: { ...inputEvent, hook_point: hookPoint } });
  },

  run: async () => {
    const { code, inputEvent, mockKvs, originMocks, provider } = get();
    set({ executionState: "running", output: null, logs: [], error: null, durationMs: null, simulatedResponse: null });

    const result: ExecutionResult = await provider.execute(code, inputEvent, mockKvs);

    if (result.ok && result.output) {
      const simulated = computeSimulatedResponse(inputEvent, result.output, originMocks);
      set({
        executionState: "success",
        output: result.output,
        logs: result.logs,
        durationMs: result.durationMs,
        error: null,
        simulatedResponse: simulated,
        activeOutputTab: "simulation",
      });
    } else {
      set({
        executionState: "error",
        output: null,
        logs: result.logs,
        error: result.error!,
        durationMs: result.durationMs,
        simulatedResponse: null,
      });
    }
  },

  loadTemplate: (index) => {
    const template = templates[index];
    if (template) {
      // Generate default origin mocks for this template's origins
      const mocks: Record<number, OriginMockResponse> = {};
      for (const origin of template.input.origin_data) {
        mocks[origin.id] = {
          statusCode: 200,
          headers: {
            "content-type": "application/json",
            "server": "nginx/1.25",
            "x-request-id": `req-${origin.id}-${Math.random().toString(36).slice(2, 8)}`,
          },
          body: JSON.stringify({ message: `Response from ${origin.name}`, origin_id: origin.id }),
        };
      }
      set({
        code: template.code,
        inputEvent: template.input,
        mockKvs: template.kvs || {},
        originMocks: template.originMocks || mocks,
        output: null,
        logs: [],
        error: null,
        executionState: "idle",
        simulatedResponse: null,
        showTemplates: false,
      });
    }
  },

  share: () => {
    const { code, inputEvent } = get();
    const url = copyShareUrl(code, inputEvent);
    set({ shareNotification: `Copied! (${url.length} chars)` });
    setTimeout(() => set({ shareNotification: null }), 3000);
  },

  loadFromUrl: () => {
    const hash = window.location.hash;
    if (hash) {
      const state = decodeState(hash);
      if (state) {
        // Regenerate origin mocks from the loaded input's origin_data
        const mocks: Record<number, OriginMockResponse> = {};
        for (const origin of state.input.origin_data) {
          mocks[origin.id] = {
            statusCode: 200,
            headers: { "content-type": "application/json", "server": "nginx/1.25" },
          body: JSON.stringify({ message: `Response from ${origin.name}`, origin_id: origin.id }),
          };
        }
        set({
          code: state.code,
          inputEvent: state.input,
          mockKvs: state.kvs || {},
          originMocks: mocks,
          output: null,
          logs: [],
          error: null,
          executionState: "idle",
          simulatedResponse: null,
        });
      }
    }
  },

  setShowTemplates: (show) => set({ showTemplates: show }),
  setActiveOutputTab: (tab) => set({ activeOutputTab: tab }),
}));

function computeSimulatedResponse(
  input: EdgeActionEvent,
  output: EdgeActionEvent,
  originMocks: Record<number, OriginMockResponse>,
): SimulatedResponse {
  const handlerSelectedId = output.origin?.id ?? -1;
  const handlerSetResponseCode = output.response.response_code > 0;

  // If handler set an error response_code (4xx/5xx) WITHOUT selecting an origin, it's a synthetic response
  // (e.g., geo-block returning 403). The request never reaches an origin.
  // Setting 2xx/3xx response_code is just an override — request still goes to origin.
  if (handlerSetResponseCode && handlerSelectedId < 0 && output.response.response_code >= 400) {
    return {
      statusCode: output.response.response_code,
      headers: { ...output.response.headers },
      body: "",
      selectedOriginId: -1,
      selectedOriginName: "None (blocked by handler)",
      routingMethod: "synthetic",
    };
  }

  // If handler didn't pick an origin, simulate AFD weighted routing
  let resolvedOriginId = handlerSelectedId;
  if (resolvedOriginId < 0 && input.origin_data.length > 0) {
    const healthy = input.origin_data.filter((o) => o.is_healthy);
    const pool = healthy.length > 0 ? healthy : input.origin_data;
    // Weighted random selection (simulates AFD default routing)
    const totalWeight = pool.reduce((sum, o) => sum + o.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const o of pool) {
      roll -= o.weight;
      if (roll <= 0) { resolvedOriginId = o.id; break; }
    }
    if (resolvedOriginId < 0) resolvedOriginId = pool[0].id;
  }

  const selectedOrigin = input.origin_data.find((o) => o.id === resolvedOriginId);
  const originMock = originMocks[resolvedOriginId];

  // Compute the final merged response (origin response with handler's response mods applied)
  const baseStatus = originMock?.statusCode ?? 200;
  const baseHeaders = { ...(originMock?.headers ?? {}) };
  const baseBody = originMock?.body ?? "";

  // Handler response_code overrides origin status; handler headers merge on top
  // Note: body override is not supported in production — body always comes from origin
  const finalStatus = handlerSetResponseCode ? output.response.response_code : baseStatus;
  const finalHeaders = { ...baseHeaders, ...output.response.headers };
  const finalBody = baseBody;

  const routingMethod = handlerSelectedId >= 0 ? "handler" : "weighted";

  return {
    statusCode: finalStatus,
    headers: finalHeaders,
    body: finalBody,
    selectedOriginId: resolvedOriginId,
    selectedOriginName: selectedOrigin?.name ?? (resolvedOriginId >= 0 ? `Unknown (ID ${resolvedOriginId})` : "No origins"),
    routingMethod,
  };
}
