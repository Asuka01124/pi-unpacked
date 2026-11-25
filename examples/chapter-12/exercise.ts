import type { ReadEvidence, Summarize } from "./scenario.ts";

export const readEvidence: ReadEvidence = (_line) => {
	throw new Error("请先实现 readEvidence。");
};

export const summarize: Summarize = (_results) => {
	throw new Error("请先实现 summarize。");
};
