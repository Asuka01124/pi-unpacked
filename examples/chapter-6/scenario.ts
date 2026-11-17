import { log } from "../chapter-4/fixtures.ts";
import * as reference from "./policy.ts";
import {
	DIAGNOSTIC_NOTE, DIAGNOSTIC_TOOL, MODE_ENTRY, TRIAGE_HINT, diagnose, lastDiagnosis, restoreMode,
	type CheckToolCall, type Mode, type TriageTools,
} from "./policy.ts";

type Policy = { triageTools: TriageTools; checkToolCall: CheckToolCall };

export function replayTriage(policy: Policy = reference) {
	const previousTools = ["read", "bash", "edit", "write", DIAGNOSTIC_TOOL];
	const mode: Mode = { enabled: true, previousTools };
	const activeTools = policy.triageTools(previousTools);
	const entry = { type: "custom", customType: MODE_ENTRY, data: mode };
	const evidence = diagnose(log);
	const message = {
		role: "toolResult",
		toolName: DIAGNOSTIC_TOOL,
		toolCallId: "call_1",
		isError: false,
		content: [
			{ type: "text", text: evidence ? `第 ${evidence.line} 行：${evidence.text}` : "未找到 HTTP 401。" },
			...(evidence ? [{ type: "text", text: DIAGNOSTIC_NOTE }] : []),
		],
		details: evidence,
	};
	const branch = [entry, { type: "message", message }];
	return [
		{ label: "/triage on", description: "命令切换工具列表，并保存一条扩展状态。", data: { previousTools, activeTools, entry } },
		{ label: "发起运行", description: "before_agent_start 给系统提示词加一段调查指令。", data: { activeTools, sections: { triage: TRIAGE_HINT } } },
		{ label: "诊断工具返回", description: "tool_result 补充一句说明，结构化证据仍在 details 里。", data: message },
		{
			label: "测试拦截",
			description: "单独向 tool_call 处理器传入 bash，观察在调用到达该钩子时会怎样。",
			data: { toolName: "bash", decision: policy.checkToolCall(true, "bash") ?? null },
		},
		{ label: "恢复会话", description: "从当前分支重建调查模式和最近证据。", data: { mode: restoreMode(branch), evidence: lastDiagnosis(branch) } },
		{ label: "/triage off", description: "关闭调查模式，恢复开启前的工具。", data: { activeTools: previousTools, entry: { ...entry, data: { ...mode, enabled: false } } } },
	];
}
