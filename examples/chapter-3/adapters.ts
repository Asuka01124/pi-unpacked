import type { AssistantMessage, Message, ToolCall } from "../agent-loop.ts";

export type Api = "responses" | "messages";
export type WireEvent = Record<string, unknown>;
export type StreamUpdate = { type: "text_delta" | "toolcall_delta"; delta: string } | { type: "toolcall_end"; toolCall: ToolCall };

const readTool = {
	name: "read",
	description: "读取本实验的示例日志。唯一可读文件是 test.log。",
};
const readSchema = {
	type: "object",
	properties: { path: { type: "string" } },
	required: ["path"],
	additionalProperties: false,
};

// #region request
export function responsesRequest(model: string, messages: readonly Message[]) {
	return {
		model,
		stream: true,
		store: false,
		tools: [{ type: "function", ...readTool, parameters: readSchema }],
		input: messages.map((message) => {
			if (message.role === "toolResult") {
				return { type: "function_call_output", call_id: message.toolCallId, output: message.content };
			}
			if (message.role === "assistant" && message.stopReason !== "stop") {
				const call = message.toolCall;
				return { type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) };
			}
			return { role: message.role, content: message.role === "user" ? message.content : message.text };
		}),
	};
}

export function messagesRequest(model: string, messages: readonly Message[]) {
	return {
		model,
		stream: true,
		max_tokens: 512,
		tools: [{ ...readTool, input_schema: readSchema }],
		messages: messages.map((message) => {
			if (message.role === "toolResult") {
				return {
					role: "user",
					content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: message.content, is_error: message.isError }],
				};
			}
			if (message.role === "assistant" && message.stopReason !== "stop") {
				const call = message.toolCall;
				return { role: "assistant", content: [{ type: "tool_use", id: call.id, name: call.name, input: call.arguments }] };
			}
			return { role: message.role, content: message.role === "user" ? message.content : message.text };
		}),
	};
}
// #endregion request

export function asRecord(value: unknown): WireEvent {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("预期收到 JSON 对象。");
	return value as WireEvent;
}

function asString(value: unknown): string {
	if (typeof value !== "string") throw new Error("流事件缺少预期字符串。");
	return value;
}

type PendingCall = { index: unknown; id: string; raw: string; finished: boolean };

export async function readAssistant(
	api: Api,
	events: AsyncIterable<WireEvent> | Iterable<WireEvent>,
	onUpdate?: (event: StreamUpdate) => void,
): Promise<AssistantMessage> {
	let pending: PendingCall | undefined;
	let text = "";
	let stopReason: "stop" | "toolUse" | "length" | undefined;
	let receivedMessageStop = false;

	function start(index: unknown, id: unknown, name: unknown, raw: string) {
		if (pending || name !== "read") throw new Error("本章每轮只接收一次 read 调用。");
		pending = { index, id: asString(id), raw, finished: false };
	}

	function append(index: unknown, value: unknown) {
		if (!pending || pending.index !== index || pending.finished) throw new Error("工具参数增量没有对应的未完成调用。");
		const delta = asString(value);
		pending.raw += delta;
		onUpdate?.({ type: "toolcall_delta", delta });
	}

	function finish(index: unknown, final?: unknown) {
		if (!pending || pending.index !== index || pending.finished) throw new Error("工具结束事件与调用不匹配。");
		if (final !== undefined) pending.raw = asString(final);
		pending.finished = true;
	}

	function appendText(value: unknown) {
		const delta = asString(value);
		text += delta;
		onUpdate?.({ type: "text_delta", delta });
	}

	for await (const event of events) {
		if (event.type === "error" || event.type === "response.failed") {
			throw new Error("服务商返回了流错误。");
		}
		if (api === "responses") {
			if (event.type === "response.output_item.added") {
				const item = asRecord(event.item);
				if (item.type === "function_call") start(event.output_index, item.call_id, item.name, asString(item.arguments));
			} else if (event.type === "response.function_call_arguments.delta") {
				append(event.output_index, event.delta);
			} else if (event.type === "response.function_call_arguments.done") {
				if (!pending || pending.index !== event.output_index) throw new Error("最终参数没有对应的调用。");
				pending.raw = asString(event.arguments);
			} else if (event.type === "response.output_item.done") {
				const item = asRecord(event.item);
				if (item.type === "function_call") finish(event.output_index, item.arguments);
			} else if (event.type === "response.output_text.delta") {
				appendText(event.delta);
			} else if (event.type === "response.completed") {
				stopReason = pending ? "toolUse" : "stop";
			} else if (event.type === "response.incomplete") {
				const details = asRecord(asRecord(event.response).incomplete_details);
				if (details.reason !== "max_output_tokens") throw new Error("Responses 回复未完成。");
				stopReason = "length";
			}
		} else {
			if (event.type === "content_block_start") {
				const block = asRecord(event.content_block);
				if (block.type === "tool_use") {
					const input = asRecord(block.input);
					start(event.index, block.id, block.name, Object.keys(input).length ? JSON.stringify(input) : "");
				}
			} else if (event.type === "content_block_delta") {
				const delta = asRecord(event.delta);
				if (delta.type === "input_json_delta") append(event.index, delta.partial_json);
				if (delta.type === "text_delta") appendText(delta.text);
			} else if (event.type === "content_block_stop" && pending && pending.index === event.index) {
				finish(event.index);
			} else if (event.type === "message_delta") {
				const { stop_reason } = asRecord(event.delta);
				if (stop_reason === "max_tokens") stopReason = "length";
				else if (stop_reason === "tool_use") stopReason = "toolUse";
				else if (stop_reason === "end_turn" || stop_reason === "stop_sequence") stopReason = "stop";
				else if (stop_reason != null) throw new Error(`本实验未处理停止原因 ${String(stop_reason)}。`);
			} else if (event.type === "message_stop") {
				receivedMessageStop = true;
				break;
			}
		}
		if (api === "responses" && stopReason) break;
	}

	if (!stopReason || (api === "messages" && !receivedMessageStop)) throw new Error("流提前结束，缺少完整的结束事件。");
	if (!pending) {
		if (stopReason !== "stop") throw new Error("回复未能完成一次工具调用或正常给出答案。");
		return { role: "assistant", stopReason, text };
	}
	const toolCall: ToolCall = { id: pending.id, name: "read", arguments: { path: "" } };
	if (stopReason === "length") return { role: "assistant", stopReason, toolCall };
	if (stopReason !== "toolUse" || !pending.finished) throw new Error("工具调用尚未完成。");
	// 增量只用于展示。完整回复确认后才用严格 JSON 解析最终参数。
	toolCall.arguments = { path: asString(asRecord(JSON.parse(pending.raw)).path) };
	onUpdate?.({ type: "toolcall_end", toolCall });
	return { role: "assistant", stopReason, toolCall };
}
