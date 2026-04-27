// Lifted from claudemap/app/src/mcp/server.js (the bootstrap, not the handlers)
// @ claudemap@vendored.
// Adapted: TS strict; iterates the IntentGraph tool families under ./tools/
// (graph.*, retrieval.*, task.*, verify.*, trace.*) instead of ClaudeMap's
// monolithic handlers.js. The handler implementations are stubs at this stage
// — this lift wires only the bootstrap and the registration loop.
// License: MIT (see /claudemap/LICENSE). See LIFT_LOG.md for the full lift record.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { ToolDefinition } from './tool-definition.js';
import { graphToolDefinitions } from './tools/graph.js';
import { retrievalToolDefinitions } from './tools/retrieval.js';
import { taskToolDefinitions } from './tools/task.js';
import { traceToolDefinitions } from './tools/trace.js';
import { verifyToolDefinitions } from './tools/verify.js';

export type { ToolDefinition };

export interface SkillMcpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const SERVER_NAME = 'intentgraph-skill';
const SERVER_VERSION = '0.0.0';

function collectToolDefinitions(): ToolDefinition[] {
  return [
    ...graphToolDefinitions,
    ...retrievalToolDefinitions,
    ...taskToolDefinitions,
    ...verifyToolDefinitions,
    ...traceToolDefinitions,
  ];
}

export function createSkillMcpServer(): SkillMcpServer {
  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;

  return {
    async start(): Promise<void> {
      if (server) return;
      server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
      const definitions = collectToolDefinitions();
      for (const definition of definitions) {
        server.registerTool(
          definition.name,
          { description: definition.description },
          async (...callbackArgs: unknown[]) => {
            const args = (callbackArgs[0] ?? {}) as Record<string, unknown>;
            const result = await definition.handler(args);
            // The MCP SDK expects { content: [...] } from a tool callback. Tools
            // that already return a content array pass through; tools that return
            // a plain object get wrapped as a single text payload.
            if (
              result &&
              typeof result === 'object' &&
              'content' in result &&
              Array.isArray((result as { content: unknown }).content)
            ) {
              return result as { content: Array<{ type: 'text'; text: string }> };
            }
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(result, null, 2) },
              ],
            };
          },
        );
      }
      transport = new StdioServerTransport();
      await server.connect(transport);
    },
    async stop(): Promise<void> {
      if (transport) {
        await transport.close();
        transport = null;
      }
      server = null;
    },
  };
}
