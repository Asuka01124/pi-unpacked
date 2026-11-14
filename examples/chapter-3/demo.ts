import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runAgent } from "../agent-loop.ts";
import { asRecord, messagesRequest, readAssistant, type WireEvent } from "./adapters.ts";
import { QUESTION, replay, toolEvents } from "./scenario.ts";

async function* readSse(body: ReadableStream<Uint8Array>) {
	const reader = body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	let data: string[] = [];
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) return;
			buffer += chunk.value;
			let newline = buffer.indexOf("\n");
			while (newline !== -1) {
				const line = buffer.slice(0, newline).replace(/\r$/, "");
				buffer = buffer.slice(newline + 1);
				if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
				if (line === "" && data.length > 0) {
					yield asRecord(JSON.parse(data.join("\n")));
					data = [];
				}
				newline = buffer.indexOf("\n");
			}
		}
	} finally {
		try {
			await reader.cancel();
		} finally {
			reader.releaseLock();
		}
	}
}

const log = await readFile(new URL("../test.log", import.meta.url), "utf8");
const selection = process.argv[2] ?? "responses";

if (selection === "--live") {
	const { ANTHROPIC_API_KEY: key, ANTHROPIC_MODEL: model } = process.env;
	if (!key || !model) throw new Error("请先设置 ANTHROPIC_API_KEY 和 ANTHROPIC_MODEL。");
	let requests = 0;
	const answer = await runAgent(QUESTION, async (messages) => {
		console.log(`请求 Anthropic Messages ${++requests}`);
		const request = messagesRequest(model, messages);
		const tool_choice = requests === 1
			? { type: "tool", name: "read", disable_parallel_tool_use: true }
			: { type: "none" };
		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key },
			body: JSON.stringify({ ...request, tool_choice }),
			signal: AbortSignal.timeout(60_000),
		});
		if (!response.ok || !response.body) {
			throw new Error(`Anthropic 请求失败（HTTP ${response.status}）。请检查 API Key、模型 ID 和接口权限。`);
		}
		return readAssistant("messages", readSse(response.body), (event) => {
			if (event.type === "toolcall_delta") console.log("参数增量", JSON.stringify(event.delta));
		});
	}, async (path) => {
		if (path !== "test.log") throw new Error("只能读取示例日志 test.log。");
		console.log("本地执行 read(test.log)");
		return log;
	});
	console.log(answer);
} else if (selection === "--verify") {
	for (const api of ["responses", "messages"] as const) {
		const run = await replay(api, log);
		assert.equal(run.requests.length, 2);
		assert.equal(run.reads, 1);
		assert.ok(run.answer.includes("HTTP 401"));
		const next = asRecord(run.requests[1]);
		if (api === "responses") {
			const input = next.input as WireEvent[];
			assert.deepEqual(input[1], { type: "function_call", call_id: "call_1", name: "read", arguments: '{"path":"test.log"}' });
			assert.deepEqual(input[2], { type: "function_call_output", call_id: "call_1", output: log });
		} else {
			const messages = next.messages as WireEvent[];
			assert.deepEqual(messages[1], { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "read", input: { path: "test.log" } }] });
			assert.deepEqual(messages[2], { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: log, is_error: false }] });
		}
		assert.equal((await replay(api, log, "length")).reads, 0);
		await assert.rejects(replay(api, log, "malformed"), SyntaxError);
		const events = toolEvents(api, "success");
		await assert.rejects(readAssistant(api, events.slice(0, -1)), /流提前结束/);
		const indexField = api === "responses" ? "output_index" : "index";
		const wrongIndex = events.map((event, position) => position === 1 ? { ...event, [indexField]: 8 } : event);
		await assert.rejects(readAssistant(api, wrongIndex), /没有对应的未完成调用/);
		console.log(`通过 ${api}：调用与结果的 ID 匹配，截断、畸形参数和未结束的流均已拦截。`);
	}
} else if (selection === "responses" || selection === "messages") {
	console.log(JSON.stringify(await replay(selection, log), null, 2));
} else {
	throw new Error("请选择 responses、messages、--verify 或 --live。");
}
