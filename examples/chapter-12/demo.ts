import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import * as exercise from "./exercise.ts";
import * as reference from "./scenario.ts";
import { cases, evidenceLine, makeEvidence, type Case, type ChildResult, type Task } from "./scenario.ts";

const flags = process.argv.slice(2);
const implementation = flags.includes("--exercise") ? exercise : reference;
const worker = fileURLToPath(new URL("./worker.ts", import.meta.url));

function runChild(
	task: Task, mode: Case, signal: AbortSignal, onStart?: () => void,
): Promise<ChildResult> {
	const lines: string[] = [];
	if (signal.aborted) return Promise.resolve({ task, status: "aborted", lines });
	return new Promise((resolve) => {
		// 现有文件不可能是目录，确保故障分支无法找到指定的可执行文件。
		const program = mode === "spawn-failure" ? join(worker, "missing-executable") : process.execPath;
		const args = [worker, task, ...(mode === "cancel" ? ["--hold"] : [])];
		const child = spawn(program, args, { stdio: ["ignore", "pipe", "pipe"] });
		const rows = createInterface({ input: child.stdout, crlfDelay: Infinity });
		let spawnError: Error | undefined;
		let aborted = false;
		let stderr = "";
		const deadline = setTimeout(() => child.kill("SIGKILL"), 8_000);
		const abort = () => {
			if (child.exitCode === null && child.signalCode === null) aborted = child.kill("SIGTERM");
		};

		rows.on("line", (line) => lines.push(line));
		if (onStart) rows.once("line", onStart);
		child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
		child.once("error", (error) => { spawnError = error; });
		child.once("close", (code, terminationSignal) => {
			clearTimeout(deadline);
			rows.close();
			signal.removeEventListener("abort", abort);
			if (aborted) return resolve({ task, status: "aborted", error: "收到父级取消信号。", lines });
			if (spawnError) return resolve({ task, status: "failed", error: "无法启动子进程。", lines });
			if (code !== 0) {
				return resolve({ task, status: "failed", error: stderr.trim() || `子进程退出：${terminationSignal ?? code}`, lines });
			}
			// 进程结束后解析已收集的行。解析失败会作为该子任务的失败结果。
			try {
				const evidence = lines.map(implementation.readEvidence).findLast(Boolean);
				resolve(evidence
					? { task, status: "completed", evidence, lines }
					: { task, status: "failed", error: "没有最终证据。", lines });
			} catch (error) {
				resolve({ task, status: "failed", error: String(error), lines });
			}
		});
		signal.addEventListener("abort", abort, { once: true });
	});
}

async function run(mode: Case) {
	const controller = new AbortController();
	let markStarted!: () => void;
	const codeStarted = new Promise<void>((resolve) => { markStarted = resolve; });
	const log = runChild("log", "success", controller.signal);
	const code = runChild("code", mode, controller.signal, markStarted);
	if (mode === "cancel") {
		await log;
		await Promise.race([codeStarted, code]);
		controller.abort();
	}
	const children = await Promise.all([log, code]);
	return { children, summary: implementation.summarize(children) };
}

if (flags.includes("--verify")) {
	assert.equal(implementation.readEvidence("无法解析"), undefined);
	assert.equal(implementation.readEvidence('{"type":"tool_execution_end"}'), undefined);
	assert.equal(implementation.readEvidence('{"type":"message_end","message":{"role":"toolResult"}}'), undefined);
	assert.equal(implementation.readEvidence(evidenceLine("log")), makeEvidence("log"));
	const expected = { success: "completed", "spawn-failure": "failed", cancel: "aborted" };
	for (const { id } of cases) {
		const { children, summary } = await run(id);
		assert.deepEqual(children.map(({ status }) => status), ["completed", expected[id]]);
		assert.deepEqual(summary.evidence, id === "success" ? [makeEvidence("log"), makeEvidence("code")] : [makeEvidence("log")]);
		assert.deepEqual(summary.incomplete, id === "success" ? [] : ["code"]);
		if (id === "cancel") assert.equal(children[1].lines.length, 1);
		if (id === "spawn-failure") assert.equal(children[1].lines.length, 0);
	}
	console.log("通过第十二章验收：独立子进程、JSON 行、启动失败、取消传播和部分结果。");
} else {
	for (const { id, label } of cases) console.log(label, JSON.stringify(await run(id), null, 2));
}
