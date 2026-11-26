import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "./client.ts";
import * as exercise from "./exercise.ts";
import * as reference from "./protocol.ts";
import { READ_TASK, STEER_MESSAGE, TEST_TASK, type Event, type Reply } from "./protocol.ts";

const verify = process.argv.includes("--verify");
const implementation = process.argv.includes("--exercise") ? exercise : reference;

function verifyReader() {
	const received: string[] = [];
	const reader = implementation.createReader((line) => received.push(line));
	const record = '{"text":"登录\u2028日志"}';
	const bytes = new TextEncoder().encode(record + "\r\n{}\n");
	for (const byte of bytes) reader.push(Uint8Array.of(byte));
	reader.end();
	assert.deepEqual(received, [record, "{}"]);
	const order: string[] = [];
	const pending = new Map([
		["a", { resolve: () => { order.push("a"); }, reject: () => {} }],
		["b", { resolve: () => { order.push("b"); }, reject: () => {} }],
	]);
	implementation.routeRecord({ type: "response", id: "b", command: "get_state", success: true }, pending, () => {});
	implementation.routeRecord({ type: "agent_start" }, pending, () => { order.push("event"); });
	implementation.routeRecord({ type: "response", id: "a", command: "prompt", success: true }, pending, () => {});
	assert.deepEqual(order, ["b", "event", "a"]);
	assert.equal(pending.size, 0);
}

if (verify) verifyReader();
const events: Event[] = [];
const listeners = new Set<(event: Event) => void>();
const client = createClient(
	(chunk, command) => {
		if (!verify) console.log("命令", JSON.stringify(command));
		return new Promise<void>((resolve, reject) => {
			child.stdin.write(chunk, (error) => error ? reject(error) : resolve());
		});
	},
	(event) => {
		events.push(event);
		if (!verify) console.log("事件", JSON.stringify(event));
		for (const listener of listeners) listener(event);
	},
	implementation,
);
const child = spawn(process.execPath, [fileURLToPath(new URL("./worker.ts", import.meta.url))], {
	stdio: ["pipe", "pipe", "inherit"],
});
const exited = new Promise<void>((resolve, reject) => {
	child.once("error", reject);
	child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`RPC 服务退出：${code}`)));
});
void exited.catch(() => {});
child.stdin.on("error", () => {});
const deadline = setTimeout(() => { child.kill(); client.close(); }, 10_000);
child.stdout.on("data", client.push);
child.once("close", () => client.close());

async function run(message: string, interrupt: "steer" | "abort") {
	const offset = events.length;
	let action: Promise<Reply> | undefined;
	let settle!: (aborted: boolean) => void;
	let rejectSettle!: (error: unknown) => void;
	const settled = new Promise<boolean>((resolve, reject) => { settle = resolve; rejectSettle = reject; });
	void settled.catch(() => {});
	void exited.then(() => rejectSettle(new Error("RPC 连接先于运行结束关闭。")), rejectSettle);

	const listener = (event: Event) => {
		if (event.type === "tool_execution_start") {
			action = interrupt === "steer"
				? client.send({ type: "steer", message: STEER_MESSAGE })
				: client.send({ type: "abort" });
			void action.catch(rejectSettle);
		}
		if (event.type === "agent_settled") settle(event.aborted);
	};
	listeners.add(listener);
	try {
		const response = await client.send({ type: "prompt", message });
		if (!verify) console.log("回执", JSON.stringify(response));
		assert.deepEqual(response.data, { disposition: "started" });
		const aborted = await settled;
		const actionResponse = await action;
		if (!verify) console.log("回执", JSON.stringify(actionResponse));
		return { aborted, events: events.slice(offset) };
	} finally {
		listeners.delete(listener);
	}
}

try {
	const steered = await run(READ_TASK, "steer");
	const cancelled = await run(TEST_TASK, "abort");
	const state = await client.send({ type: "get_state" });
	if (!verify) console.log("回执", JSON.stringify(state));
	if (verify) {
		assert.equal(steered.aborted, false);
		assert.deepEqual(steered.events.map(({ type }) => type), [
			"agent_start", "tool_execution_start", "tool_execution_end", "message_end", "message_end", "agent_end", "agent_settled",
		]);
		assert.ok(steered.events.some((event) => event.type === "message_end" && event.message.content === "HTTP 401"));
		assert.equal(cancelled.aborted, true);
		assert.ok(cancelled.events.some((event) => event.type === "tool_execution_end" && event.isError));
		assert.ok(!cancelled.events.some((event) => event.type === "message_end"));
		assert.deepEqual(state.data, { isStreaming: false });
		console.log("通过第十三章验收：JSONL 分帧、ID 配对、运行中引导与取消。");
	}
} finally {
	child.stdin.end();
	try { await exited; } finally { clearTimeout(deadline); client.close(); }
}
