import assert from "node:assert/strict";
import * as exercise from "./exercise.ts";
import * as reference from "./policy.ts";
import { replayTriage } from "./scenario.ts";

const flags = process.argv.slice(2);
const policy = flags.includes("--exercise") ? exercise : reference;
const trace = replayTriage(policy);

if (flags.includes("--verify")) {
	const tool = reference.DIAGNOSTIC_TOOL;
	const base = ["write", "read", "bash", "edit", "grep", tool, "custom_tool"];
	assert.deepEqual(policy.triageTools(base), ["read", "grep", tool]);
	assert.deepEqual(policy.triageTools([]), []);
	assert.deepEqual(base, ["write", "read", "bash", "edit", "grep", tool, "custom_tool"]);
	for (const name of ["bash", "edit", "write", "custom_tool"]) {
		const decision = policy.checkToolCall(true, name);
		assert.equal(decision?.block, true);
		assert.ok(decision.reason.includes(name));
	}
	assert.equal(policy.checkToolCall(true, tool), undefined);
	assert.equal(policy.checkToolCall(false, "bash"), undefined);
	const on = { enabled: true, previousTools: base };
	const off = { enabled: false, previousTools: base };
	const entry = { type: "custom", customType: reference.MODE_ENTRY };
	assert.deepEqual(reference.restoreMode([{ ...entry, data: on }, { ...entry, data: off }]), off);
	assert.deepEqual(reference.restoreMode([{ ...entry, data: on }]), on);
	assert.equal(reference.restoreMode([{ ...entry, data: { enabled: true, previousTools: [0] } }]), undefined);
	assert.equal(reference.diagnose("普通日志"), null);
	assert.deepEqual(reference.diagnose("200\r\nHTTP 401\r\nHTTP 401 again"), { line: 2, text: "HTTP 401" });
	const outcome = trace[4].data;
	assert.ok("evidence" in outcome);
	assert.equal(outcome.evidence?.line, 9);
	assert.equal(reference.lastDiagnosis([]), null);
	console.log("通过第六章验收：切换工具、拦截调用、恢复当前分支和诊断证据。");
} else {
	for (const step of trace) console.log(`\n${step.label}\n${JSON.stringify(step.data, null, 2)}`);
}
