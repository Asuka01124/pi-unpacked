import assert from "node:assert/strict";
import * as exercise from "./exercise.ts";
import * as reference from "./compaction.ts";
import { cases, contextWindow, replayCompaction, reserveTokens } from "./scenario.ts";

const flags = process.argv.slice(2);
const implementation = flags.includes("--exercise") ? exercise : reference;

if (flags.includes("--verify")) {
	const short = replayCompaction("short", implementation);
	const roomy = replayCompaction("roomy", implementation);
	const tight = replayCompaction("tight", implementation);
	const threshold = contextWindow - reserveTokens;
	assert.equal(reference.shouldCompact(threshold, contextWindow, reserveTokens), false);
	assert.ok(short.tokensBefore < threshold);
	assert.equal(short.compaction, undefined);
	assert.deepEqual(short.nextRequest, short.before);
	assert.equal(roomy.compaction?.firstKeptEntryId, "check-auth");
	assert.equal(roomy.plan?.turnPrefix.length, 0);
	assert.equal(tight.compaction?.firstKeptEntryId, "read-detail");
	assert.deepEqual(tight.plan?.turnPrefix.map(({ id }) => id), ["check-auth", "read-log", "log-output"]);
	for (const result of [roomy, tight]) {
		assert.ok(result.tokensBefore > threshold);
		assert.ok(result.tokensAfter < result.tokensBefore);
		assert.deepEqual(result.stored.slice(0, -1), result.original);
		assert.equal(result.nextRequest[0]?.role, "compactionSummary");
		assert.deepEqual(result.nextRequest.slice(-2), result.before.slice(-2));
		assert.match(result.answer, /Authorization.*暂不改代码/);
	}
	const later = {
		type: "message" as const, id: "reply", parentId: "compact-1", timestamp: "2026-01-01T00:00:01.000Z",
		message: { role: "assistant" as const, stopReason: "stop" as const, text: tight.answer },
	};
	assert.deepEqual(implementation.rebuildContext([...tight.stored, later]), [...tight.nextRequest, later.message]);
	console.log("通过第九章验收：触发阈值、两种切点、投影顺序和压缩后接续。");
} else {
	for (const { id, label } of cases) {
		const { tokensBefore, tokensAfter, compaction, plan, nextRequest, answer } = replayCompaction(id, implementation);
		console.log(`\n${label} · 估算 token ${tokensBefore} → ${tokensAfter}`);
		console.log(JSON.stringify({ compaction, turnPrefix: plan?.turnPrefix.map(({ id }) => id), nextRequest, answer }, null, 2));
	}
}
