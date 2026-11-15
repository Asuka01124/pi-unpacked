import assert from "node:assert/strict";
import * as exercise from "./exercise.ts";
import { editCases, log, source } from "./fixtures.ts";
import * as reference from "./tools.ts";

const flags = process.argv.slice(2);
const { readPage, applyEdits } = flags.includes("--exercise") ? exercise : reference;

if (flags.includes("--verify")) {
	const first = readPage(log, 1, 100);
	assert.equal(first.nextOffset, 5);
	assert.match(first.content, /offset=5/);
	assert.doesNotMatch(first.content, /HTTP 401/);
	const second = readPage(log, first.nextOffset);
	assert.equal(second.nextOffset, 9);
	assert.doesNotMatch(second.content, /HTTP 401/);
	const last = readPage(log, second.nextOffset);
	assert.match(last.content, /HTTP 401/);
	assert.equal(last.nextOffset, undefined);
	assert.equal(readPage("a\r\n\r\nb\r\n", 1, 3).content, "a\n\nb");
	assert.equal(readPage("").content, "文件为空。");
	assert.equal(readPage("a\nb", 1, 1).nextOffset, 2);
	const unicode = "汉".repeat(53);
	assert.equal(readPage(`${unicode}\n字`).nextOffset, 2);
	assert.throws(() => readPage("汉".repeat(54)), /第 1 行超过/);
	assert.throws(() => readPage(log, 0), /offset/);
	assert.throws(() => readPage(log, 11), /超出范围/);
	assert.throws(() => readPage(log, 1, 0.5), /limit/);
	console.log("通过 read：分页、续读、UTF-8 字节上限和参数校验。");

	assert.throws(() => applyEdits(source, editCases.duplicate), /匹配多处/);
	assert.throws(() => applyEdits(source, editCases.overlap), /修改重叠/);
	assert.throws(() => applyEdits(source, [{ oldText: "", newText: "!" }]), /不能为空/);
	assert.throws(() => applyEdits(source, [{ oldText: "已被其他人修改的内容", newText: "!" }]), /找不到/);
	assert.equal(applyEdits(source, editCases.unique), source.replace("1000", "1500"));
	assert.equal(applyEdits("abc", [{ oldText: "a", newText: "bc" }, { oldText: "bc", newText: "!" }]), "bc!");
	console.log("通过 edit：唯一匹配、重叠检查和原文坐标。");
} else if (flags.includes("edit")) {
	for (const [name, edits] of Object.entries(editCases)) {
		try {
			console.log(`\n${name}\n${applyEdits(source, edits)}`);
		} catch (error) {
			console.log(`\n${name}\n${error instanceof Error ? error.message : String(error)}`);
		}
	}
} else {
	let offset: number | undefined = 1;
	// 用固定规则模拟模型看到续读提示后发起下一次调用。
	while (offset !== undefined) {
		console.log(`\nread({ path: "test.log", offset: ${offset}, limit: ${reference.MAX_LINES} })`);
		const page = readPage(log, offset);
		console.log(page.content);
		if (page.content.includes("HTTP 401")) break;
		// 模型能看到的是提示里的行号。nextOffset 方便演示端检查进度。
		const hint = page.content.match(/用 offset=(\d+) 继续。\]$/);
		const next = hint ? Number(hint[1]) : undefined;
		if (next !== page.nextOffset || (next !== undefined && next <= offset)) throw new Error("续读提示与返回行号不一致，或行号没有前进。");
		offset = next;
	}
}
