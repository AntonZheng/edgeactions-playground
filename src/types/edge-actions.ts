// TypeScript type definitions for Azure Front Door Edge Actions

export interface EdgeActionEvent {
  request: HttpRequest;
  origin_data: CdnOrigin[];
  response: HttpResponse;
  hook_point: number;
  context: Record<string, string>;
  origin: OriginSelection;
}

export interface HttpRequest {
  uri: string;
  method: string;
  query_string: string;
  headers: Record<string, string>;
  body: string;
}

export interface HttpResponse {
  response_code: number;
  headers: Record<string, string>;
  body: string;
  set_cookie_headers: string[];
}

export interface CdnOrigin {
  id: number;
  name: string;
  weight: number;
  priority: number;
  is_healthy: boolean;
}

export interface OriginSelection {
  id: number;
}

/** Configurable mock response per origin (for origin simulation) */
export interface OriginMockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const HookPoint = {
  ClientRequest: 0,
  OriginRequest: 1,
  OriginResponse: 2,
  ClientResponse: 3,
} as const;

export const HookPointLabels: Record<number, string> = {
  0: "Client Request",
  1: "Origin Request",
  2: "Origin Response",
  3: "Client Response",
};

export function defaultOriginMocks(): Record<number, OriginMockResponse> {
  return {
    0: {
      statusCode: 200,
      headers: { "content-type": "application/json", "server": "nginx/1.25", "x-request-id": "abc-123" },
      body: '{"message": "Hello from East US origin", "region": "eastus"}',
    },
    1: {
      statusCode: 200,
      headers: { "content-type": "application/json", "server": "nginx/1.25", "x-request-id": "def-456" },
      body: '{"message": "Hello from West US origin", "region": "westus"}',
    },
  };
}

export function defaultEdgeActionEvent(): EdgeActionEvent {
  return {
    request: {
      uri: "/api/hello",
      method: "GET",
      query_string: "",
      headers: {
        host: "example.azurefd.net",
        "user-agent": "Mozilla/5.0",
        accept: "text/html",
      },
      body: "",
    },
    origin_data: [
      { id: 0, name: "origin-eastus.myapp.net", weight: 100, priority: 1, is_healthy: true },
      { id: 1, name: "origin-westus.myapp.net", weight: 100, priority: 1, is_healthy: true },
    ],
    response: {
      response_code: 0,
      headers: {},
      body: "",
      set_cookie_headers: [],
    },
    hook_point: HookPoint.ClientRequest,
    context: {},
    origin: { id: -1 },
  };
}

// TypeScript definitions string for Monaco IntelliSense
export const EDGE_ACTIONS_DTS = `
declare interface EdgeActionEvent {
  request: HttpRequest;
  origin_data: Array<CdnOrigin>;
  response: HttpResponse;
  hook_point: number;
  /**
   * Read-only request metadata provided by Azure Front Door at the edge.
   * Available keys: country_code (ISO country code), is_mobile ("1" if mobile).
   * Changes to context in the returned event are discarded.
   */
  context: { [key: string]: string };
  origin: OriginSelection;
}

declare interface HttpRequest {
  uri: string;
  method: string;
  query_string: string;
  headers: { [key: string]: string };
  body: string;
}

declare interface HttpResponse {
  response_code: number;
  headers: { [key: string]: string };
  body: string;
  set_cookie_headers: Array<string>;
}

declare interface CdnOrigin {
  id: number;
  name: string;
  weight: number;
  priority: number;
  is_healthy: boolean;
}

declare interface OriginSelection {
  id: number;
}

/**
 * The entry point for your Edge Action.
 * Modify the event and return it to control request/response behavior.
 */
declare function handler(event: EdgeActionEvent): EdgeActionEvent;
`;
