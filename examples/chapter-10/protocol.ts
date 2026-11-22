import type { CallResult, Tool } from "./bridge.ts";

export const VERSION = "2025-11-25";
export const SERVER = "ci";
export const JOB = "login-tests";
export const URI = "ci://runs/login-tests/log";
const log = "login-tests：预期 HTTP 200，实际 HTTP 401。";

export type Frame = { jsonrpc: "2.0"; id?: number; method: string; params?: Record<string, unknown> };
export type Reply = { jsonrpc: "2.0"; id: number; result: unknown } |
	{ jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

const tool: Tool = {
	name: "get-failed-test",
	description: "查询指定 CI 任务的失败情况。",
	inputSchema: { type: "object", properties: { job: { type: "string" } }, required: ["job"] },
};
const resource = { uri: URI, name: "登录测试日志", mimeType: "text/plain" };

export function createServer() {
	let initializing = false;
	let ready = false;
	return (frame: Frame): Reply | undefined => {
		const { id, method, params } = frame;
		if (method === "notifications/initialized" && id === undefined) {
			ready = initializing;
			return;
		}
		if (id === undefined) return;
		const result = (value: unknown): Reply => ({ jsonrpc: "2.0", id, result: value });
		const error = (code: number, message: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message } });

		if (method === "ping") return result({});
		if (method === "initialize") {
			initializing = true;
			return result({
				protocolVersion: VERSION,
				serverInfo: { name: "pi-unpacked-ci", version: "1.0.0" },
				capabilities: { tools: {}, resources: {} },
			});
		}
		if (!ready) return error(-32000, "请先完成初始化。");
		switch (method) {
			case "tools/list":
				return result({ tools: [tool] });
			case "tools/call": {
				if (params?.name !== tool.name) return error(-32602, "未知工具。");
				const args = params.arguments;
				if (!args || typeof args !== "object" || !("job" in args) || typeof args.job !== "string") {
					return error(-32602, "job 必须是字符串。");
				}
				if (args.job !== JOB) {
					return result({ content: [{ type: "text", text: "没有找到这项任务。" }], isError: true } satisfies CallResult);
				}
				return result({
					content: [{ type: "text", text: log }, { type: "resource_link", uri: URI, name: resource.name }],
					structuredContent: { job: JOB, actualStatus: 401 },
				} satisfies CallResult);
			}
			case "resources/list":
				return result({ resources: [resource] });
			case "resources/read":
				return params?.uri === URI
					? result({ contents: [{ uri: URI, mimeType: resource.mimeType, text: log }] })
					: error(-32002, "找不到资源。");
			default:
				return error(-32601, "未知方法。");
		}
	};
}
