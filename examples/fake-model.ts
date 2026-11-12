import type { AskModel } from "./agent-loop.ts";

export type Scenario = "success" | "missing" | "truncated" | "direct";

export const QUESTION = "帮我看看 test.log 里的测试为什么失败。";

export function createFakeModel(scenario: Scenario): AskModel {
	return async (messages) => {
		const last = messages.at(-1);
		if (last?.role === "toolResult") {
			return {
				role: "assistant",
				stopReason: "stop",
				text: last.isError
					? `我没能读到日志。${last.content}`
					: `${last.content.trim()}\n可以先检查测试请求是否携带有效凭据。`,
			};
		}
		if (scenario === "direct") {
			return { role: "assistant", stopReason: "stop", text: "可以先读取日志，再比较预期结果和实际结果。" };
		}
		return {
			role: "assistant",
			stopReason: scenario === "truncated" ? "length" : "toolUse",
			toolCall: {
				id: "call_1",
				name: "read",
				arguments: { path: scenario === "missing" ? "missing.log" : "test.log" },
			},
		};
	};
}
