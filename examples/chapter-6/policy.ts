export const DIAGNOSTIC_TOOL = "inspect_login_log";
export const MODE_ENTRY = "chapter-6-triage-mode";
export const TRIAGE_HINT = "先收集登录失败的证据。调用 inspect_login_log 查看示例日志，再区分已知现象与待验证原因。";

const readOnlyTools = new Set(["read", "grep", "find", "ls", DIAGNOSTIC_TOOL]);

export type TriageTools = (active: readonly string[]) => string[];
export type CheckToolCall = (triageEnabled: boolean, toolName: string) => { block: true; reason: string } | undefined;

// #region policy
export const triageTools: TriageTools = (active) => active.filter((name) => readOnlyTools.has(name));

export const checkToolCall: CheckToolCall = (triageEnabled, toolName) => {
	if (triageEnabled && !readOnlyTools.has(toolName)) {
		return { block: true, reason: `调查模式禁止调用 ${toolName}。用 /triage off 退出调查模式。` };
	}
};
// #endregion policy

export type Mode = { enabled: boolean; previousTools: string[] };
type Entry = { type: string; customType?: string; data?: unknown; message?: unknown };

export function restoreMode(branch: readonly Entry[]): Mode | undefined {
	const data = [...branch].reverse().find((entry) => entry.type === "custom" && entry.customType === MODE_ENTRY)?.data;
	if (!data || typeof data !== "object" || !("enabled" in data) || !("previousTools" in data)) return;
	if (typeof data.enabled !== "boolean" || !Array.isArray(data.previousTools)) return;
	if (!data.previousTools.every((name: unknown) => typeof name === "string")) return;
	return { enabled: data.enabled, previousTools: data.previousTools };
}

export function diagnose(log: string) {
	const lines = log.split(/\r?\n/);
	const index = lines.findIndex((line) => line.includes("HTTP 401"));
	return index === -1 ? null : { line: index + 1, text: lines[index] };
}

export type Diagnostic = ReturnType<typeof diagnose>;

export function lastDiagnosis(branch: readonly Entry[]): Diagnostic {
	for (const { type, message } of [...branch].reverse()) {
		if (type !== "message" || !message || typeof message !== "object") continue;
		if (!("role" in message) || message.role !== "toolResult" || !("toolName" in message) || message.toolName !== DIAGNOSTIC_TOOL) continue;
		if (!("isError" in message) || message.isError || !("details" in message)) continue;
		const details = message.details;
		if (details === null) return null;
		if (details && typeof details === "object" && "line" in details && "text" in details &&
			typeof details.line === "number" && typeof details.text === "string") {
			return { line: details.line, text: details.text };
		}
	}
	return null;
}

export const DIAGNOSTIC_NOTE = "日志只说明测试遇到了 HTTP 401。凭据是否缺失或无效仍需验证。";
