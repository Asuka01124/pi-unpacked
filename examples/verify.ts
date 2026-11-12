import assert from "node:assert/strict";
import { runAgent, type AskModel, type Message } from "./agent-loop.ts";
import { runExercise } from "./exercise.ts";
import { createFakeModel, QUESTION, type Scenario } from "./fake-model.ts";

const run = process.argv.includes("--exercise") ? runExercise : runAgent;
const scenarios: Scenario[] = ["direct", "success", "missing"];
if (process.argv.includes("--all")) scenarios.push("truncated");
const log = "登录测试：预期 HTTP 200，实际 HTTP 401。";

for (const scenario of scenarios) {
	const requests: Message[][] = [];
	const paths: string[] = [];
	const model = createFakeModel(scenario);
	const ask: AskModel = async (messages) => {
		requests.push(structuredClone([...messages]));
		assert.ok(requests.length <= 4, "循环应当在有限轮次内结束");
		return model(messages);
	};
	try {
		const answer = await run(QUESTION, ask, async (path) => {
			paths.push(path);
			if (path === "missing.log") throw new Error("找不到文件 missing.log。");
			assert.equal(path, "test.log");
			return log;
		});
		assert.deepEqual(requests[0], [{ role: "user", content: QUESTION }]);
		assert.equal(requests.length, scenario === "direct" ? 1 : 2, "模型请求次数");
		assert.deepEqual(paths, scenario === "success" ? ["test.log"] : scenario === "missing" ? ["missing.log"] : []);
		assert.ok(answer.trim().length > 0, "必须返回最终文本");
		if (scenario !== "direct") {
			const messages = requests[1];
			assert.equal(messages.length, 3, "第二次请求应带上用户问题、模型调用和工具结果");
			assert.deepEqual(messages[0], requests[0][0]);
			const call = messages[1];
			const result = messages[2];
			assert.ok(call.role === "assistant" && call.stopReason !== "stop");
			assert.equal(call.stopReason, scenario === "truncated" ? "length" : "toolUse");
			assert.equal(call.toolCall.name, "read");
			assert.equal(call.toolCall.arguments.path, scenario === "missing" ? "missing.log" : "test.log");
			assert.ok(result.role === "toolResult");
			assert.equal(result.toolCallId, call.toolCall.id, "结果必须对应原调用 ID");
			assert.equal(result.isError, scenario !== "success");
			if (scenario === "success") assert.equal(result.content, log);
			else if (scenario === "missing") assert.equal(result.content, "找不到文件 missing.log。");
			else assert.ok(result.content.trim().length > 0, "截断调用应返回错误说明");
			assert.ok(answer.includes(result.content.trim()), "假模型的最终回答应包含工具结果");
		}
		console.log(`通过 ${scenario}：模型请求 ${requests.length} 次，读取尝试 ${paths.length} 次。`);
	} catch (error) {
		console.error(`未通过 ${scenario}：`, error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
