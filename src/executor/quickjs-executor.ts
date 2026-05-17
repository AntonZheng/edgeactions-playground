import { getQuickJS, type QuickJSContext } from "quickjs-emscripten";
import type { EdgeActionEvent } from "../types/edge-actions";

export interface ExecutionResult {
  ok: boolean;
  output?: EdgeActionEvent;
  error?: string;
  logs: ConsoleEntry[];
  durationMs: number;
}

export interface ConsoleEntry {
  level: "log" | "warn" | "error" | "info";
  message: string;
}

function injectConsole(vm: QuickJSContext, logs: ConsoleEntry[]) {
  const consoleObj = vm.newObject();

  for (const level of ["log", "warn", "error", "info"] as const) {
    const fn = vm.newFunction(level, (...args) => {
      const messages = args.map((h) => {
        const val = vm.dump(h);
        return typeof val === "string" ? val : JSON.stringify(val);
      });
      logs.push({ level, message: messages.join(" ") });
    });
    vm.setProp(consoleObj, level, fn);
    fn.dispose();
  }

  vm.setProp(vm.global, "console", consoleObj);
  consoleObj.dispose();
}

function injectKvsMock(
  vm: QuickJSContext,
  mockKvs: Record<string, string>
) {
  const mockFn = vm.newFunction("__ea_kvs_get", (keyHandle) => {
    const key = vm.getString(keyHandle);
    const value = mockKvs[key];
    const result = vm.newObject();
    if (value !== undefined) {
      const okVal = vm.newString(value);
      vm.setProp(result, "Ok", okVal);
      okVal.dispose();
    } else {
      const errVal = vm.newString(`Key '${key}' not found`);
      vm.setProp(result, "Err", errVal);
      errVal.dispose();
    }
    return result;
  });
  vm.setProp(vm.global, "__ea_kvs_get", mockFn);
  mockFn.dispose();
}

const KVS_SHIM = `
var EdgeActionKvs = {
  getDefaultKeyValueStore: function() {
    return {
      get: function(key) {
        var result = __ea_kvs_get(key);
        if (result.Ok !== undefined) return result.Ok;
        throw new Error("KeyValueStoreReadError: " + (result.Err || "unknown"));
      }
    };
  }
};
`;

export async function executeAction(
  code: string,
  event: EdgeActionEvent,
  mockKvs: Record<string, string> = {}
): Promise<ExecutionResult> {
  const logs: ConsoleEntry[] = [];
  const start = performance.now();

  try {
    const QuickJS = await getQuickJS();
    const vm = QuickJS.newContext();

    // Inject console capture
    injectConsole(vm, logs);

    // Inject KVS mock
    injectKvsMock(vm, mockKvs);

    // Load KVS shim (provides EdgeActionKvs global)
    const kvsResult = vm.evalCode(KVS_SHIM, "kvs-shim.js");
    if (kvsResult.error) {
      const err = vm.dump(kvsResult.error);
      kvsResult.error.dispose();
      vm.dispose();
      return {
        ok: false,
        error: `KVS shim error: ${err?.message || err}`,
        logs,
        durationMs: performance.now() - start,
      };
    }
    kvsResult.value.dispose();

    // Set input event as a global string
    const inputJson = JSON.stringify(event);
    const inputHandle = vm.newString(inputJson);
    vm.setProp(vm.global, "__ea_input__", inputHandle);
    inputHandle.dispose();

    // Execute user code + call handler
    const wrappedCode = `
${code}

(function() {
  var __event = JSON.parse(__ea_input__);
  var __result = handler(__event);
  return JSON.stringify(__result);
})();
`;

    const result = vm.evalCode(wrappedCode, "edge_action.js");

    if (result.error) {
      const err = vm.dump(result.error);
      result.error.dispose();
      vm.dispose();
      return {
        ok: false,
        error: typeof err === "object" ? `${err.name}: ${err.message}\n${err.stack || ""}` : String(err),
        logs,
        durationMs: performance.now() - start,
      };
    }

    const outputJson = vm.getString(result.value);
    result.value.dispose();
    vm.dispose();

    const output: EdgeActionEvent = JSON.parse(outputJson);
    return {
      ok: true,
      output,
      logs,
      durationMs: performance.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      logs,
      durationMs: performance.now() - start,
    };
  }
}
