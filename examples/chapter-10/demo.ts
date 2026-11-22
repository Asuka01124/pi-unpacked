import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import * as reference from "./bridge.ts";
import * as exercise from "./exercise.ts";
import { JOB, URI, type Reply } from "./protocol.ts";
import { cases, replayMcp, type Case, type Exchange } from "./scenario.ts";

const flags = process.argv.slice(2);
const implementation = flags.includes("--exercise") ? exercise : reference;

async function run(mode: Case) {
	const child = spawn(process.execPath, [fileURLToPath(new URL("./server.ts", import.meta.url))], {
		stdio: ["pipe", "pipe", "inherit"],
		timeout: 8_000,
	});
	const finished = new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`服务端退出：${code}`)));
	});
	// 读取出错时，下面的 finally 仍会等待退出并报告问题。
	void finished.catch(() => {});
	child.stdin.on("error", () => {});
	const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
	const rows = lines[Symbol.asyncIterator]();
	const exchange: Exchange = async (frame) => {
		await new Promise<void>((resolve, reject) => child.stdin.write(JSON.stringify(frame) + "\n", (error) => {
			if (error) reject(error);
			else resolve();
		}));
		if (frame.id === undefined) return;
		const row = await rows.next();
		if (row.done) throw new Error(`没有收到 ${frame.method} 的应答。`);
		return JSON.parse(row.value) as Reply;
	};
	try {
		return await replayMcp(mode, exchange, implementation);
	} finally {
		child.stdin.end();
		try {
			await finished;
		} finally {
			lines.close();
		}
	}
}

if (flags.includes("--verify")) {
	const [allowed, blocked, resource] = await Promise.all([run("allow"), run("block"), run("resource")]);
	const methods = (trace: typeof allowed) => trace.messages.flatMap(({ message }) => "method" in message ? [message.method] : []);
	const handshake = ["initialize", "notifications/initialized", "tools/list"];
	assert.deepEqual(methods(allowed), [...handshake, "tools/call"]);
	assert.deepEqual(methods(blocked), handshake);
	assert.deepEqual(methods(resource), [...handshake, "resources/list", "resources/read"]);
	assert.equal(allowed.tool.name, "mcp__ci__get_failed_test");
	assert.equal(allowed.tool.remoteName, "get-failed-test");
	assert.deepEqual(allowed.tool.parameters.required, ["job"]);
	assert.deepEqual(allowed.result?.details.structuredContent, { job: JOB, actualStatus: 401 });
	assert.match(allowed.result?.content[0].text ?? "", /HTTP 401/);
	assert.ok(allowed.result?.content[1].text.includes(URI));
	assert.equal(allowed.result?.isError, false);
	assert.equal(implementation.toToolResult({ content: [{ type: "text", text: "找不到任务" }], isError: true }).isError, true);
	assert.equal(blocked.hook?.block, true);
	assert.equal(blocked.result, null);
	assert.equal(resource.resource?.uri, URI);
	assert.match(resource.resource?.text ?? "", /HTTP 401/);
	console.log("通过第十章验收：真实 stdio、握手、工具桥接、拦截与资源读取。");
} else {
	for (const { id, label } of cases) {
		const trace = await run(id);
		console.log(`\n${label}`);
		for (const { direction, message } of trace.messages) console.log(direction, JSON.stringify(message));
		console.log("Pi 侧视图", JSON.stringify({ tool: trace.tool, hook: trace.hook, result: trace.result, resource: trace.resource }, null, 2));
	}
}
