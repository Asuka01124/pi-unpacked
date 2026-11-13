import { referenceScheduling, runAgent, type ExecutionMode, type InputMode, type RunEvent, type Scheduling } from "./runtime.ts";

const QUESTION = "读取 test.log 和 missing.log，告诉我登录测试出了什么问题。";
export const EXTRA_INPUT = "只总结 test.log，并给出一个排查建议。";

export async function replayRun(
	mode: ExecutionMode,
	input: InputMode,
	log: string,
	scheduling: Scheduling = referenceScheduling,
): Promise<RunEvent[]> {
	const events: RunEvent[] = [];
	await runAgent({
		question: QUESTION,
		mode,
		onEvent: (event) => events.push(event),
		askModel: async (messages) => {
			if (messages.length === 1) {
				return {
					role: "assistant",
					stopReason: "toolUse",
					content: [
						{ type: "toolCall", id: "call_1", name: "read", arguments: { path: "test.log" } },
						{ type: "toolCall", id: "call_2", name: "read", arguments: { path: "missing.log" } },
					],
				};
			}
			const last = messages.at(-1);
			const readResult = messages.find((message) => message.role === "toolResult" && message.toolCallId === "call_1");
			const missingResult = messages.find((message) => message.role === "toolResult" && message.toolCallId === "call_2");
			if (readResult?.role !== "toolResult" || missingResult?.role !== "toolResult") {
				throw new Error("假模型尚未收到两个工具结果。");
			}
			const evidence = readResult.content.trim();
			const answer = last?.role === "user" && last.content === EXTRA_INPUT
				? `${evidence} 建议先检查测试请求是否携带有效凭据。`
				: `${evidence} ${missingResult.content}`;
			return { role: "assistant", stopReason: "stop", content: [{ type: "text", text: answer }] };
		},
		read: async (path, enqueue) => {
			if (path === "missing.log") throw new Error("找不到文件 missing.log。");
			if (path !== "test.log") throw new Error(`未知的实验文件 ${path}。`);
			// 固定在慢读开始后入队，四种组合都能复现同一个输入时机。
			enqueue(input, EXTRA_INPUT);
			await new Promise<void>((resolve) => setTimeout(resolve, 120));
			return log;
		},
	}, scheduling);
	return events;
}
