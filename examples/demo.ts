import { readFile } from "node:fs/promises";
import { runAgent } from "./agent-loop.ts";
import { runExercise } from "./exercise.ts";
import { createFakeModel, QUESTION } from "./fake-model.ts";

const scenario = process.argv[2] ?? "success";
if (scenario !== "success" && scenario !== "missing" && scenario !== "truncated" && scenario !== "direct") {
	throw new Error("场景必须是 success、missing、truncated 或 direct。");
}

let requests = 0;
let reads = 0;
const model = createFakeModel(scenario);
const run = process.argv.includes("--exercise") ? runExercise : runAgent;
const answer = await run(
	QUESTION,
	async (messages) => {
		requests++;
		console.log(`\n请求 ${requests} 发给模型的消息`);
		console.log(JSON.stringify(messages, null, 2));
		return model(messages);
	},
	async (path) => {
		reads++;
		if (path !== "test.log" && path !== "missing.log") throw new Error(`未知的实验文件 ${path}。`);
		try {
			return await readFile(new URL(path, import.meta.url), "utf8");
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				throw new Error(`找不到文件 ${path}。`);
			}
			throw error;
		}
	},
);

console.log(`\n最终回答\n${answer}`);
console.log(`\n模型请求 ${requests} 次，read 执行 ${reads} 次。`);
