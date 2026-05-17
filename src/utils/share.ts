import LZString from "lz-string";
import type { EdgeActionEvent } from "../types/edge-actions";

export interface ShareableState {
  v: 1;
  code: string;
  input: EdgeActionEvent;
  kvs?: Record<string, string>;
}

export function encodeState(state: ShareableState): string {
  const json = JSON.stringify(state);
  return "#" + LZString.compressToEncodedURIComponent(json);
}

export function decodeState(hash: string): ShareableState | null {
  if (!hash || hash.length < 2) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash.slice(1));
    if (!json) return null;
    return JSON.parse(json) as ShareableState;
  } catch {
    return null;
  }
}

export function copyShareUrl(code: string, input: EdgeActionEvent, kvs: Record<string, string>): string {
  const state: ShareableState = { v: 1, code, input, kvs };
  const hash = encodeState(state);
  const url = window.location.origin + window.location.pathname + hash;
  navigator.clipboard.writeText(url);
  return url;
}
