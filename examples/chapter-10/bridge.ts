export type Tool = {
	name: string;
	description: string;
	inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] };
};
export type Block = { type: "text"; text: string } | { type: "resource_link"; name: string; uri: string };
export type CallResult = { content: Block[]; structuredContent?: unknown; isError?: boolean };
export type RegisterTool = (server: string, tool: Tool) => {
	name: string; remoteName: string; description: string; parameters: Tool["inputSchema"];
};
export type ToToolResult = (result: CallResult) => {
	content: { type: "text"; text: string }[]; details: CallResult; isError: boolean;
};

// #region bridge
export const registerTool: RegisterTool = (server, tool) => {
	const normalize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_");
	return {
		name: `mcp__${normalize(server)}__${normalize(tool.name)}`,
		remoteName: tool.name,
		description: tool.description,
		parameters: tool.inputSchema,
	};
};

export const toToolResult: ToToolResult = (result) => ({
	content: result.content.map((block) => block.type === "text" ? block : {
		type: "text",
		text: `${block.name}：${block.uri}`,
	}),
	details: result,
	isError: result.isError === true,
});
// #endregion bridge
