import type { Message } from "../agent-loop.ts";
import type { Entry } from "../chapter-8/session.ts";
import * as reference from "./compaction.ts";
import {
	estimateTokens, messagesFrom, shouldCompact,
	type CompactionEntry, type ContextMessage, type PrepareCompaction, type RebuildContext, type SessionEntry,
} from "./compaction.ts";

export const cases = [
	{ id: "short", label: "短日志" },
	{ id: "roomy", label: "长日志 · 保留整段调查" },
	{ id: "tight", label: "长日志 · 较小保留预算" },
] as const;
export type Case = typeof cases[number]["id"];
type Implementation = { prepareCompaction: PrepareCompaction; rebuildContext: RebuildContext };

const goal = "排查 test.log 里第一次出现的 HTTP 401。";
const restriction = "这一步只核对请求是否携带凭据，先别改代码。";
const evidence = "第 9 行 POST /login → HTTP 401，Authorization 未设置。";
const timestamp = "2026-01-01T00:00:00.000Z";
export const contextWindow = 640;
export const reserveTokens = 120;

function makePath(long: boolean) {
	const path: Entry[] = [];
	const append = (id: string, message: Message) => {
		path.push({ type: "message", id, parentId: path.at(-1)?.id ?? null, timestamp, message });
	};
	const read = (id: string, offset: number) => {
		const args = { path: "test.log", offset };
		append(id, { role: "assistant", stopReason: "toolUse", toolCall: { id, name: "read", arguments: args } });
	};
	const result = (id: string, call: string, content: string) =>
		append(id, { role: "toolResult", toolCallId: call, content, isError: false });

	append("goal", { role: "user", content: goal });
	append("found", { role: "assistant", stopReason: "stop", text: "已确定失败出现在登录用例。" });
	append("check-auth", { role: "user", content: restriction });
	read("read-log", 1);
	const setup = long
		? Array.from({ length: 7 }, (_, i) =>
			`INFO #${i + 1} ${"初始化测试客户端，加载登录用例的调试配置。".repeat(12)}`,
		).join("\n")
		: "INFO 测试客户端启动。";
	result("log-output", "read-log", setup);
	read("read-detail", 8);
	result("auth-line", "read-detail", evidence);
	return path;
}

function summarize(history: readonly Entry[], turnPrefix: readonly Entry[]): string {
	// 离线摘要器只复述这份示例里确实出现过的目标和约束。
	const old = messagesFrom(history).filter((message) => message.role === "user").map((message) => message.content);
	const prefix = messagesFrom(turnPrefix).filter((message) => message.role === "user").map((message) => message.content);
	return [
		old.length ? `历史摘要：${old.join(" ")}` : "",
		prefix.length ? `当前调查前情：${prefix.join(" ")}` : "",
	].filter(Boolean).join("\n");
}

function continueInvestigation(context: readonly ContextMessage[]) {
	const instructions = context.flatMap((message) =>
		message.role === "user" || message.role === "compactionSummary" ? [message.content] : [],
	).join("\n");
	const latest = context.findLast((message) => message.role === "toolResult");
	if (!instructions.includes(goal) || !instructions.includes(restriction) || latest?.content !== evidence) {
		return "缺少调查目标、限制或凭据证据，需要重新确认。";
	}
	return "第 9 行的登录请求没有携带 Authorization。先检查测试客户端如何装配凭据，暂不改代码。";
}

export function replayCompaction(id: Case, implementation: Implementation = reference) {
	const original = makePath(id !== "short");
	const before = implementation.rebuildContext(original);
	const tokensBefore = before.reduce((sum, message) => sum + estimateTokens(message), 0);
	const recentMessages = messagesFrom(original.slice(id === "tight" ? -1 : 2));
	const keepRecentTokens = recentMessages.reduce((sum, message) => sum + estimateTokens(message), 0);
	const plan = shouldCompact(tokensBefore, contextWindow, reserveTokens)
		? implementation.prepareCompaction(original, keepRecentTokens)
		: undefined;
	const compaction: CompactionEntry | undefined = plan && {
		type: "compaction",
		id: "compact-1",
		parentId: original[original.length - 1].id,
		firstKeptEntryId: plan.firstKeptEntryId,
		tokensBefore,
		summary: summarize(plan.history, plan.turnPrefix),
	};
	const stored: SessionEntry[] = compaction ? [...original, compaction] : original;
	const nextRequest = implementation.rebuildContext(stored);
	return {
		original, stored, before, tokensBefore, keepRecentTokens, plan, compaction, nextRequest,
		tokensAfter: nextRequest.reduce((sum, message) => sum + estimateTokens(message), 0),
		answer: continueInvestigation(nextRequest),
	};
}
