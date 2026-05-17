import type { EdgeActionEvent } from "../types/edge-actions";

export interface ConsoleEntry {
  level: "log" | "warn" | "error" | "info";
  message: string;
}

export interface ExecutionResult {
  ok: boolean;
  output?: EdgeActionEvent;
  error?: string;
  logs: ConsoleEntry[];
  durationMs: number;
}

/**
 * Strategy interface for execution providers.
 * Today: LocalProvider (QuickJS WASM in browser)
 * Future: RemoteProvider (POST /api/execute → Hyperlight sandbox)
 */
export interface ExecutionProvider {
  name: string;
  description: string;
  execute(
    code: string,
    event: EdgeActionEvent,
    mockKvs?: Record<string, string>
  ): Promise<ExecutionResult>;
}
