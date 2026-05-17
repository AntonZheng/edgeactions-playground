import LZString from "lz-string";
import type { EdgeActionEvent } from "../types/edge-actions";
import { defaultEdgeActionEvent } from "../types/edge-actions";

export interface ShareableState {
  v: 1;
  code: string;
  input: EdgeActionEvent;
  kvs?: Record<string, string>;
}

// Compact keys: c=code, i=input, r=request, o=origin_data, s=response, h=hook_point, x=context, g=origin
// Request: u=uri, m=method, q=query_string, d=headers, b=body
// Response: rc=response_code, d=headers, b=body, sc=set_cookie_headers
// Origin: i=id, n=name, w=weight, p=priority, y=is_healthy

interface CompactState {
  v: 2;
  c: string;
  i: {
    r: { u: string; m: string; q?: string; d: Record<string, string>; b?: string };
    o?: Array<{ i: number; n: string; w: number; p: number; y: boolean }>;
    s?: { rc?: number; d?: Record<string, string>; b?: string; sc?: string[] };
    h?: number;
    x?: Record<string, string>;
    g?: { i: number };
  };
}

function compactEncode(code: string, input: EdgeActionEvent): CompactState {
  const defaults = defaultEdgeActionEvent();

  const compact: CompactState = {
    v: 2,
    c: code,
    i: {
      r: {
        u: input.request.uri,
        m: input.request.method,
        d: input.request.headers,
      },
    },
  };

  // Only include non-default request fields
  if (input.request.query_string) compact.i.r.q = input.request.query_string;
  if (input.request.body) compact.i.r.b = input.request.body;

  // Only include origins if different from default
  if (JSON.stringify(input.origin_data) !== JSON.stringify(defaults.origin_data)) {
    compact.i.o = input.origin_data.map((o) => ({ i: o.id, n: o.name, w: o.weight, p: o.priority, y: o.is_healthy }));
  }

  // Only include response if non-default
  if (input.response.response_code > 0 || Object.keys(input.response.headers).length > 0 || input.response.body) {
    compact.i.s = {};
    if (input.response.response_code > 0) compact.i.s.rc = input.response.response_code;
    if (Object.keys(input.response.headers).length > 0) compact.i.s.d = input.response.headers;
    if (input.response.body) compact.i.s.b = input.response.body;
    if (input.response.set_cookie_headers.length > 0) compact.i.s.sc = input.response.set_cookie_headers;
  }

  // Only include hook_point if not ClientRequest (0)
  if (input.hook_point !== 0) compact.i.h = input.hook_point;

  // Only include context if non-empty
  if (Object.keys(input.context).length > 0) compact.i.x = input.context;

  // Only include origin selection if set
  if (input.origin.id >= 0) compact.i.g = { i: input.origin.id };

  return compact;
}

function compactDecode(compact: CompactState): ShareableState {
  const defaults = defaultEdgeActionEvent();

  const input: EdgeActionEvent = {
    request: {
      uri: compact.i.r.u,
      method: compact.i.r.m,
      query_string: compact.i.r.q || "",
      headers: compact.i.r.d,
      body: compact.i.r.b || "",
    },
    origin_data: compact.i.o
      ? compact.i.o.map((o) => ({ id: o.i, name: o.n, weight: o.w, priority: o.p, is_healthy: o.y }))
      : defaults.origin_data,
    response: {
      response_code: compact.i.s?.rc || 0,
      headers: compact.i.s?.d || {},
      body: compact.i.s?.b || "",
      set_cookie_headers: compact.i.s?.sc || [],
    },
    hook_point: compact.i.h ?? 0,
    context: compact.i.x || {},
    origin: compact.i.g ? { id: compact.i.g.i } : { id: -1 },
  };

  return { v: 1, code: compact.c, input };
}

export function encodeState(code: string, input: EdgeActionEvent): string {
  const compact = compactEncode(code, input);
  const json = JSON.stringify(compact);
  return "#" + LZString.compressToEncodedURIComponent(json);
}

export function decodeState(hash: string): ShareableState | null {
  if (!hash || hash.length < 2) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash.slice(1));
    if (!json) return null;
    const parsed = JSON.parse(json);

    // Support v2 compact format only
  if (parsed.v === 2) {
    return compactDecode(parsed as CompactState);
  }
  return null;
  } catch {
    return null;
  }
}

export function copyShareUrl(code: string, input: EdgeActionEvent): string {
  const hash = encodeState(code, input);
  const url = window.location.origin + window.location.pathname + hash;
  navigator.clipboard.writeText(url);
  return url;
}
