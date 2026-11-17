import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { log } from "../chapter-4/fixtures.ts";
import {
	DIAGNOSTIC_NOTE, DIAGNOSTIC_TOOL, MODE_ENTRY, TRIAGE_HINT,
	checkToolCall, diagnose, lastDiagnosis, restoreMode, triageTools, type Mode,
} from "./policy.ts";

export default function (pi: ExtensionAPI) {
	let mode: Mode | undefined;

	function setTools() {
		if (!mode) return;
		pi.setActiveTools(mode.enabled ? triageTools(mode.previousTools) : mode.previousTools);
	}

	function restore(ctx: ExtensionContext) {
		mode = restoreMode(ctx.sessionManager.getBranch());
		setTools();
	}

	pi.on("session_start", (_event, ctx) => restore(ctx));
	pi.on("session_tree", (_event, ctx) => restore(ctx));

	// #region command
	pi.registerCommand("triage", {
		description: "切换登录故障调查模式（on、off 或 status）",
		handler: async (args, ctx) => {
			const action = args.trim() || "status";
			if (action === "status") {
				const evidence = lastDiagnosis(ctx.sessionManager.getBranch());
				ctx.ui.notify(`调查模式${mode?.enabled ? "已开启" : "已关闭"}。${evidence ? `最近证据：第 ${evidence.line} 行。` : "暂无诊断证据。"}`);
				return;
			}
			if (action !== "on" && action !== "off") {
				ctx.ui.notify("用法：/triage on、/triage off 或 /triage status。", "warning");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("当前运行结束后再切换调查模式。", "warning");
				return;
			}
			const enabled = action === "on";
			if (Boolean(mode?.enabled) === enabled) return;
			const previousTools = mode?.enabled ? mode.previousTools : pi.getActiveTools();
			mode = { enabled, previousTools };
			setTools();
			pi.appendEntry(MODE_ENTRY, mode);
			ctx.ui.notify(`调查模式${enabled ? "已开启" : "已关闭"}。`);
		},
	});
	// #endregion command

	pi.registerTool({
		name: DIAGNOSTIC_TOOL,
		label: "检查登录日志",
		description: "查找本教程示例日志中第一条 HTTP 401，返回行号和原文。",
		parameters: Type.Object({}),
		async execute() {
			const evidence = diagnose(log);
			return {
				content: [{ type: "text", text: evidence ? `第 ${evidence.line} 行：${evidence.text}` : "未找到 HTTP 401。" }],
				details: evidence,
			};
		},
	});

	// #region hooks
	pi.on("before_agent_start", (event) => {
		if (mode?.enabled) event.systemPromptOptions.sections.triage = TRIAGE_HINT;
	});

	pi.on("tool_call", (event) => checkToolCall(Boolean(mode?.enabled), event.toolName));

	pi.on("tool_result", (event) => {
		if (event.toolName !== DIAGNOSTIC_TOOL || event.isError || !event.details) return;
		return { content: [...event.content, { type: "text", text: DIAGNOSTIC_NOTE }] };
	});
	// #endregion hooks
}
