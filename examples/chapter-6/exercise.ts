import type { CheckToolCall, TriageTools } from "./policy.ts";

export const triageTools: TriageTools = (_active) => {
	throw new Error("请先实现 triageTools。");
};

export const checkToolCall: CheckToolCall = (_triageEnabled, _toolName) => {
	throw new Error("请先实现 checkToolCall。");
};
