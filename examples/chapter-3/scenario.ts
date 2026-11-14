import { runAgent, type AssistantMessage } from "../agent-loop.ts";
import { messagesRequest, readAssistant, responsesRequest, type Api, type WireEvent } from "./adapters.ts";

const QUESTION = "先调用 read 读取 test.log，再用中文告诉我测试失败的现象和一个排查方向。";
const DELTAS = ['{"pa', 'th":"test', '.log"}'];
const FINAL_ARGUMENTS = DELTAS.join("");

export function toolEvents(api: Api, scenario: "success" | "malformed" | "length"): WireEvent[] {
	const raw = scenario === "malformed" ? '{"path":"test.log",]' : FINAL_ARGUMENTS;
	const deltas = scenario === "malformed" ? [FINAL_ARGUMENTS.slice(0, -1), ",]"] : DELTAS;
	if (api === "responses") {
		const item = { type: "function_call", id: "fc_1", call_id: "call_1", name: "read" };
		return [
			{ type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "" } },
			...deltas.map((delta) => ({ type: "response.function_call_arguments.delta", output_index: 0, delta })),
			{ type: "response.function_call_arguments.done", output_index: 0, arguments: raw },
			{ type: "response.output_item.done", output_index: 0, item: { ...item, arguments: raw } },
			scenario === "length"
				? { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }
				: { type: "response.completed" },
		];
	}
	return [
		{ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "read", input: {} } },
		...deltas.map((partial_json) => ({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json } })),
		{ type: "content_block_stop", index: 0 },
		{ type: "message_delta", delta: { stop_reason: scenario === "length" ? "max_tokens" : "tool_use" } },
		{ type: "message_stop" },
	];
}

function answerEvents(api: Api, text: string): WireEvent[] {
	if (api === "responses") return [{ type: "response.output_text.delta", delta: text }, { type: "response.completed" }];
	return [
		{ type: "content_block_delta", delta: { type: "text_delta", text } },
		{ type: "message_delta", delta: { stop_reason: "end_turn" } },
		{ type: "message_stop" },
	];
}

export async function replay(api: Api, log: string, scenario: "success" | "malformed" | "length" = "success") {
	const firstEvents = toolEvents(api, scenario);
	const requests: object[] = [];
	let firstReply: AssistantMessage | undefined;
	let reads = 0;
	const answer = await runAgent(QUESTION, async (messages) => {
		const request = api === "responses" ? responsesRequest("fixture-model", messages) : messagesRequest("fixture-model", messages);
		requests.push(request);
		const result = messages.at(-1);
		if (result?.role !== "toolResult") {
			firstReply = await readAssistant(api, firstEvents);
			return firstReply;
		}
		return readAssistant(api, answerEvents(api, result.isError
			? result.content
			: `${result.content.trim()} 建议先检查测试请求的凭据。`));
	}, async (path) => {
		if (path !== "test.log") throw new Error("只能读取示例日志 test.log。");
		reads++;
		return log;
	});
	return { requests, firstEvents, firstReply, answer, reads };
}

export { QUESTION };
