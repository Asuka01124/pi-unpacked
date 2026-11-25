import { log } from "../chapter-4/fixtures.ts";

export const tasks = ["log", "code"] as const;
export type Task = typeof tasks[number];
export type Status = "completed" | "failed" | "aborted";
export type ChildResult = { task: Task; status: Status; evidence?: string; error?: string; lines: string[] };
export type ReadEvidence = (line: string) => string | undefined;
export type Summarize = (results: readonly ChildResult[]) => { evidence: string[]; incomplete: Task[] };

export const taskLabels: Record<Task, string> = { log: "日志调查", code: "代码调查" };
const codeFixture = 'const loginHeaders = { "Content-Type": "application/json" };';

export const cases = [
	{ id: "success", label: "正常并发" },
	{ id: "spawn-failure", label: "启动失败" },
	{ id: "cancel", label: "取消剩余任务" },
] as const;
export type Case = typeof cases[number]["id"];

export function makeEvidence(task: Task): string {
	if (task === "log") {
		const rows = log.split("\n");
		const index = rows.findIndex((line) => line.includes("HTTP 401"));
		if (index < 0) throw new Error("示例日志里找不到 HTTP 401。");
		return `日志第 ${index + 1} 行：${rows[index]}`;
	}
	return `示例登录请求头片段：${codeFixture} 该片段没有设置 Authorization。`;
}

export function startLine(task: Task): string {
	return JSON.stringify({ type: "agent_start", task });
}

export function evidenceLine(task: Task): string {
	return JSON.stringify({
		type: "message_end",
		message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: makeEvidence(task) }] },
	});
}

// #region collect
export const readEvidence: ReadEvidence = (line) => {
	let event;
	try {
		event = JSON.parse(line);
	} catch {
		return;
	}
	const message = event?.message;
	if (event?.type !== "message_end" || message?.role !== "assistant" || message.stopReason !== "stop") return;
	if (!Array.isArray(message.content)) return;
	const text = message.content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
	return text || undefined;
};

export const summarize: Summarize = (results) => {
	const evidence: string[] = [];
	const incomplete: Task[] = [];
	for (const result of results) {
		if (result.status === "completed" && result.evidence) evidence.push(result.evidence);
		else incomplete.push(result.task);
	}
	return { evidence, incomplete };
};
// #endregion collect

export function replay(mode: Case): ChildResult[] {
	const completed = (task: Task): ChildResult => ({
		task, status: "completed", evidence: makeEvidence(task), lines: [startLine(task), evidenceLine(task)],
	});
	const logResult = completed("log");
	if (mode === "spawn-failure") {
		return [logResult, { task: "code", status: "failed", error: "无法启动子进程。", lines: [] }];
	}
	if (mode === "cancel") {
		return [logResult, { task: "code", status: "aborted", error: "收到父级取消信号。", lines: [startLine("code")] }];
	}
	return [logResult, completed("code")];
}
