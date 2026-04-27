// Original to IntentGraph (no ClaudeMap analog). Defines the message protocol
// between the React app and the ELK layout worker. The protocol is a contract:
// the worker file must not import anything that would pull React or DOM-only
// modules into the worker bundle.

export interface LayoutNodeInput {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdgeInput {
  id: string;
  source: string;
  target: string;
}

export interface LayoutOptions {
  elkOptions?: Record<string, string>;
}

export interface LayoutPosition {
  id: string;
  x: number;
  y: number;
}

export interface LayoutWorkerRequest {
  id: string;
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  options?: LayoutOptions;
}

export type LayoutWorkerResponse =
  | { id: string; positions: LayoutPosition[]; error?: undefined }
  | { id: string; positions?: undefined; error: string };
