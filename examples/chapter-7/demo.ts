import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as exercise from "./exercise.ts";
import * as reference from "./policy.ts";
import { NOTE_PATH } from "./policy.ts";
import { NOTE, replayWrite, scenarios, simulateReadOnly, type Scenario } from "./scenario.ts";

const flags = process.argv.slice(2);
const policy = flags.includes("--exercise") ? exercise : reference;
const directory = await mkdtemp(join(tmpdir(), "pi-unpacked-ch7-"));
const target = join(directory, NOTE_PATH);
let writes = 0;

const run = (id: Scenario) => replayWrite(id, async ({ content }) => {
	writes++;
	if (id === "readonly") simulateReadOnly();
	await writeFile(target, content, { flag: "wx" });
}, policy);

try {
	if (flags.includes("--verify")) {
		assert.equal(policy.parseWriteInput(null), undefined);
		assert.equal(policy.parseWriteInput([]), undefined);
		assert.equal(policy.parseWriteInput({ path: NOTE_PATH, content: 401 }), undefined);
		assert.equal(policy.parseWriteInput({ path: "other.txt", content: NOTE }), undefined);
		assert.deepEqual(policy.parseWriteInput({ path: NOTE_PATH, content: NOTE }), { path: NOTE_PATH, content: NOTE });
		assert.equal(policy.approveWrite(undefined)?.block, true);

		const stages = ["查找工具", "校验参数", "执行前审批", "文件写入"];
		const stops = { hidden: 0, invalid: 1, denied: 2, readonly: 3, success: 3 };
		for (const { id } of scenarios) {
			const trace = await run(id);
			assert.deepEqual(trace.events.map(({ stage }) => stage), stages.slice(0, stops[id] + 1));
			assert.ok(trace.events.slice(0, -1).every(({ ok }) => ok));
			assert.equal(trace.events.at(-1)?.ok, id === "success");
			if (id !== "success") await assert.rejects(stat(target), { code: "ENOENT" });
		}
		assert.equal(writes, 2);
		assert.equal(await readFile(target, "utf8"), NOTE);
		console.log("通过第七章验收：工具暴露、参数校验、执行前审批和文件写入。");
	} else {
		for (const { id, label } of scenarios) {
			const trace = await run(id);
			console.log("\n" + label);
			for (const event of trace.events) {
				console.log(`  ${event.stage} ${event.ok ? "通过" : "停止"} · ${event.detail}`);
			}
		}
	}
} finally {
	// 这里只清理 mkdtemp 创建的实验目录。
	await rm(directory, { recursive: true, force: true });
}
