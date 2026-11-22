import * as reference from "./bridge.ts";
import type { CallResult, RegisterTool, Tool, ToToolResult } from "./bridge.ts";
import { JOB, SERVER, VERSION, type Frame, type Reply } from "./protocol.ts";

export const cases = [
	{ id: "allow", label: "允许调用工具" },
	{ id: "block", label: "执行前拦截" },
	{ id: "resource", label: "按 URI 读取资源" },
] as const;
export type Case = typeof cases[number]["id"];
export type Exchange = (frame: Frame) => Reply | undefined | Promise<Reply | undefined>;
type Implementation = { registerTool: RegisterTool; toToolResult: ToToolResult };

export async function replayMcp(mode: Case, exchange: Exchange, implementation: Implementation = reference) {
	const messages: { direction: string; message: Frame | Reply }[] = [];
	let nextId = 1;

	async function send(frame: Frame) {
		messages.push({ direction: "客户端 → 服务端", message: frame });
		const reply = await exchange(frame);
		if (reply) messages.push({ direction: "服务端 → 客户端", message: reply });
		return reply;
	}

	async function request<T>(method: string, params?: Record<string, unknown>) {
		const id = nextId++;
		const reply = await send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
		if (!reply || reply.jsonrpc !== "2.0" || reply.id !== id) throw new Error(`应答 ID 不匹配：${method}`);
		if ("error" in reply) throw new Error(reply.error.message);
		return reply.result as T;
	}

	const handshake = await request<{ protocolVersion: string; capabilities: { tools?: object; resources?: object } }>("initialize", {
		protocolVersion: VERSION, capabilities: {}, clientInfo: { name: "pi-unpacked-lab", version: "1.0.0" },
	});
	if (handshake.protocolVersion !== VERSION || !handshake.capabilities.tools) throw new Error("缺少实验要求的协议版本或工具能力。");
	await send({ jsonrpc: "2.0", method: "notifications/initialized" });
	const { tools } = await request<{ tools: Tool[] }>("tools/list");
	const tool = implementation.registerTool(SERVER, tools[0]);

	if (mode === "resource") {
		if (!handshake.capabilities.resources) throw new Error("服务端没有声明资源能力。");
		const { resources } = await request<{ resources: { uri: string }[] }>("resources/list");
		const { uri } = resources[0];
		const { contents } = await request<{ contents: { uri: string; text: string }[] }>("resources/read", { uri });
		return { tool, messages, hook: null, resource: contents[0], result: null };
	}

	// 模拟 Pi 执行管线的 tool_call。拒绝时不调用下面的协议客户端。
	const hook = { type: "tool_call", toolName: tool.name, block: mode === "block" };
	if (hook.block) return { tool, messages, hook, resource: null, result: null };

	const reply = await request<CallResult>("tools/call", { name: tool.remoteName, arguments: { job: JOB } });
	return { tool, messages, hook, resource: null, result: implementation.toToolResult(reply) };
}
