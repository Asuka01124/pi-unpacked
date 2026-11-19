import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as exercise from "./exercise.ts";
import * as reference from "./session.ts";
import { branches, decodeSession, encodeSession, makeSession, sharedId } from "./scenario.ts";

const flags = process.argv.slice(2);
const implementation = flags.includes("--exercise") ? exercise : reference;
const directory = await mkdtemp(join(tmpdir(), "pi-unpacked-ch8-"));
const file = join(directory, "session.jsonl");

try {
	await writeFile(file, encodeSession(makeSession()), { flag: "wx" });
	const jsonl = await readFile(file, "utf8");
	const entries = decodeSession(jsonl);
	const results = branches.map(({ label, leafId }) => {
		const branch = implementation.getBranch(entries, leafId);
		return { label, ids: branch.map((entry) => entry.id), messages: implementation.projectMessages(branch) };
	});

	if (flags.includes("--verify")) {
		const [credentials, route] = results;
		const shared = ["question", "read-call", "read-result", sharedId];
		assert.deepEqual(credentials.ids, [...shared, "cred-question", "cred-state", "cred-reply"]);
		assert.deepEqual(route.ids, [...shared, "route-question", "route-reply"]);
		assert.deepEqual(credentials.messages.slice(0, 4), route.messages.slice(0, 4));
		assert.deepEqual(credentials.messages.map(({ role }) => role), ["user", "assistant", "toolResult", "assistant", "user", "assistant"]);
		assert.equal(route.messages.length, 6);
		assert.notDeepEqual(credentials.messages.slice(4), route.messages.slice(4));
		assert.deepEqual(implementation.getBranch(entries, null), []);
		assert.throws(() => implementation.getBranch(entries, "missing"), Error);
		assert.throws(() => implementation.getBranch(
			[{ ...entries[0], parentId: entries[0].id }], entries[0].id,
		), Error);
		assert.equal(await readFile(file, "utf8"), jsonl);
		console.log("通过第八章验收：从同一份 JSONL 恢复两条路径，过滤扩展状态，保留原始记录。");
	} else {
		if (flags.includes("--jsonl")) console.log(jsonl);
		for (const { label, ids, messages } of results) {
			console.log(`\n${label}\n${ids.join(" → ")}\n${JSON.stringify(messages, null, 2)}`);
		}
	}
} finally {
	await rm(file, { force: true });
	await rmdir(directory);
}
