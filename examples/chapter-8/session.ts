import type { Message } from "../agent-loop.ts";

type EntryBase = { id: string; parentId: string | null; timestamp: string };
export type Entry = EntryBase & (
	| { type: "message"; message: Message }
	| { type: "custom"; customType: string; data: unknown }
);

export type GetBranch = (entries: readonly Entry[], leafId: string | null) => Entry[];
export type ProjectMessages = (branch: readonly Entry[]) => Message[];

// #region projection
export const getBranch: GetBranch = (entries, leafId) => {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const branch: Entry[] = [];
	const seen = new Set<string>();
	while (leafId !== null) {
		if (seen.has(leafId)) throw new Error(`会话路径存在环：${leafId}`);
		const entry = byId.get(leafId);
		if (!entry) throw new Error(`找不到条目：${leafId}`);
		seen.add(leafId);
		branch.push(entry);
		leafId = entry.parentId;
	}
	return branch.reverse();
};

export const projectMessages: ProjectMessages = (branch) =>
	branch.flatMap((entry) => entry.type === "message" ? [entry.message] : []);
// #endregion projection
