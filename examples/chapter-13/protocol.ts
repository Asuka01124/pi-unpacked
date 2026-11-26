export type CommandInput =
	| { type: "prompt" | "steer"; message: string }
	| { type: "abort" | "get_state" };
export type Command = CommandInput & { id: string };
export type Reply = { type: "response"; id: string; command: Command["type"]; success: boolean; data?: unknown; error?: string };

export type Event =
	| { type: "agent_start" | "agent_end" }
	| { type: "agent_settled"; aborted: boolean }
	| { type: "tool_execution_start"; toolCallId: string; toolName: string }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; isError: boolean }
	| { type: "message_end"; message: { role: "user" | "assistant"; content: string } };
export type Record = Reply | Event;
export type PendingReply = { resolve: (reply: Reply) => void; reject: (error: unknown) => void };
export type RouteRecord = (record: Record, pending: Map<string, PendingReply>, onEvent: (event: Event) => void) => void;
export type CreateReader = (onLine: (line: string) => void) => { push: (chunk: Uint8Array) => void; end: () => void };

export const READ_TASK = "读取登录日志";
export const TEST_TASK = "模拟运行登录测试";
export const STEER_MESSAGE = "只报告 HTTP 状态码。";

export function encode(value: Command | Record): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(value) + "\n");
}

// #region client
export const createReader: CreateReader = (onLine) => {
	const decoder = new TextDecoder();
	let buffer = "";
	const emit = (line: string) => onLine(line.endsWith("\r") ? line.slice(0, -1) : line);
	return {
		push(chunk) {
			buffer += decoder.decode(chunk, { stream: true });
			let index;
			while ((index = buffer.indexOf("\n")) >= 0) {
				emit(buffer.slice(0, index));
				buffer = buffer.slice(index + 1);
			}
		},
		end() {
			buffer += decoder.decode();
			if (buffer.length > 0) emit(buffer);
			buffer = "";
		},
	};
};

export const routeRecord: RouteRecord = (record, pending, onEvent) => {
	if (record.type === "response") {
		const request = pending.get(record.id);
		if (request) {
			pending.delete(record.id);
			request.resolve(record);
		}
		return;
	}
	onEvent(record);
};
// #endregion client
