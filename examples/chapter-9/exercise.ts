import type { PrepareCompaction, RebuildContext } from "./compaction.ts";

export const prepareCompaction: PrepareCompaction = (_path, _keepRecentTokens) => {
	throw new Error("请先实现 prepareCompaction。");
};

export const rebuildContext: RebuildContext = (_path) => {
	throw new Error("请先实现 rebuildContext。");
};
