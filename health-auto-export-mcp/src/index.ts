import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { HealthApiClient } from './client.js';
import { registerTools } from './tools.js';

const apiUrl = process.env.HAE_API_URL;
const readToken = process.env.HAE_READ_TOKEN;

if (!apiUrl || !readToken) {
  console.error('Missing required environment variables: HAE_API_URL, HAE_READ_TOKEN');
  process.exit(1);
}

const client = new HealthApiClient(apiUrl, readToken);

const server = new McpServer({
  name: 'health-auto-export',
  version: '1.0.0',
});

registerTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Health Auto Export MCP server running on stdio');
