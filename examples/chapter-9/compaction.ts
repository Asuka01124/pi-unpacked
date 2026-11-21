import type { Message } from "../agent-loop.ts";
import type { Entry } from "../chapter-8/session.ts";

export type CompactionEntry = {
	type: "compaction";
	id: string;
	parentId: string;
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
};
export type SessionEntry = Entry | CompactionEntry;
export type ContextMessage = Message | { role: "compactionSummary"; content: string };
type Plan = { firstKeptEntryId: string; history: Entry[]; turnPrefix: Entry[] };
export type PrepareCompaction = (path: readonly Entry[], keepRecentTokens: number) => Plan | undefined;
export type RebuildContext = (path: readonly SessionEntry[]) => ContextMessage[];

export function estimateTokens(message: ContextMessage): number {
	return Math.ceil(JSON.stringify(message).length / 4);
}

export function shouldCompact(contextTokens: number, contextWindow: number, reserveTokens: number): boolean {
	return contextTokens > contextWindow - reserveTokens;
}

export function messagesFrom(path: readonly SessionEntry[]): Message[] {
	return path.flatMap((entry) => entry.type === "message" ? [entry.message] : []);
}

// #region prepare
export const prepareCompaction: PrepareCompaction = (path, keepRecentTokens) => {
	const cuts = path.flatMap((entry, index) =>
		entry.type === "message" && (entry.message.role === "user" || entry.message.role === "assistant")
			? [index]
			: [],
	);
	if (cuts.length === 0) return;

	let firstKept = cuts[0];
	let tokens = 0;
	for (let index = path.length - 1; index >= 0; index--) {
		const entry = path[index];
		if (entry.type !== "message") continue;
		tokens += estimateTokens(entry.message);
		if (tokens >= keepRecentTokens) {
			firstKept = cuts.find((cut) => cut >= index) ?? cuts[cuts.length - 1];
			break;
		}
	}
	if (firstKept === 0) return;

	// 在用户消息处开始保留时，前面全是要总结的历史。
	// 在助手消息处开始保留时，把同一用户请求下的前半段单独交给摘要器。
	const kept = path[firstKept];
	const startsAtUser = kept.type === "message" && kept.message.role === "user";
	const turnStart = startsAtUser ? -1 : path.slice(0, firstKept).findLastIndex(
		(entry) => entry.type === "message" && entry.message.role === "user",
	);
	const historyEnd = turnStart === -1 ? firstKept : turnStart;
	return {
		firstKeptEntryId: kept.id,
		history: path.slice(0, historyEnd),
		turnPrefix: turnStart === -1 ? [] : path.slice(turnStart, firstKept),
	};
};
// #endregion prepare

// #region rebuild
export const rebuildContext: RebuildContext = (path) => {
	const checkpointIndex = path.findLastIndex((entry) => entry.type === "compaction");
	const checkpoint = path[checkpointIndex];
	if (checkpoint?.type !== "compaction") return messagesFrom(path);

	const firstKept = path.findIndex((entry) => entry.id === checkpoint.firstKeptEntryId);
	if (firstKept < 0 || firstKept > checkpointIndex) throw new Error("保留起点不在压缩条目前的路径中。");

	return [
		{ role: "compactionSummary", content: checkpoint.summary },
		...messagesFrom(path.slice(firstKept, checkpointIndex)),
		...messagesFrom(path.slice(checkpointIndex + 1)),
	];
};
// #endregion rebuild
