import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runToolBatch, takeNextInput } from "./exercise.ts";
import { describeEvent, referenceScheduling, type ExecutionMode, type InputMode } from "./runtime.ts";
import { EXTRA_INPUT, replayRun } from "./scenario.ts";

const flags = process.argv.slice(2);
const scheduling = flags.includes("--exercise") ? { runToolBatch, takeNextInput } : referenceScheduling;
const log = await readFile(new URL("../test.log", import.meta.url), "utf8");

async function verify(mode: ExecutionMode, input: InputMode) {
	const events = await replayRun(mode, input, log, scheduling);
	const requests = events.filter((event) => event.kind === "request");
	const results = events.find((event) => event.kind === "turnEnd")?.results;
	const queued = events.findIndex((event) => event.kind === "queued");
	const fastEnd = events.findIndex((event) => event.kind === "toolEnd" && event.path === "missing.log");
	const slowEnd = events.findIndex((event) => event.kind === "toolEnd" && event.path === "test.log");
	const nextRequest = events.findIndex((event) => event.kind === "request" && event.turn === 2);
	assert.ok(queued > 0 && queued < slowEnd && fastEnd > 0, "实验必须在慢工具完成前排入用户消息");
	assert.equal(fastEnd < slowEnd, mode === "parallel", "工具完成顺序");
	assert.ok(nextRequest > Math.max(fastEnd, slowEnd), "下一次模型请求应等待两项工具结果");
	assert.deepEqual(results?.map((result) => [result.toolCallId, result.isError]), [["call_1", false], ["call_2", true]]);
	assert.deepEqual(requests[1].messages.filter((message) => message.role === "toolResult"), results);
	assert.equal(requests.length, input === "steer" ? 2 : 3, "模型请求次数");
	const extraTurn = requests.findIndex((request) => request.messages.some(
		(message) => message.role === "user" && message.content === EXTRA_INPUT,
	));
	assert.equal(extraTurn + 1, input === "steer" ? 2 : 3, "新消息第一次出现的请求");
	const target = requests[extraTurn].messages.at(-1);
	assert.deepEqual(target, { role: "user", content: EXTRA_INPUT }, "新消息应在工具结果之后进入上下文");
	console.log(`通过 ${mode} / ${input}：模型请求 ${requests.length} 次，新消息进入请求 ${extraTurn + 1}。`);
}

if (flags.includes("--verify")) {
	for (const mode of ["parallel", "sequential"] as const) {
		for (const input of ["steer", "followUp"] as const) await verify(mode, input);
	}
} else {
	const mode = flags.includes("--sequential") ? "sequential" : "parallel";
	const input = flags.includes("--follow-up") ? "followUp" : "steer";
	for (const event of await replayRun(mode, input, log, scheduling)) {
		console.log(describeEvent(event));
		if (event.kind === "request") console.log(JSON.stringify(event.messages, null, 2));
	}
}
