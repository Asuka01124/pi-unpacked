import type { ApplyEdits, ReadPage } from "./tools.ts";

export const readPage: ReadPage = (_text, _offset, _limit) => {
	throw new Error("请先实现 readPage。");
};

export const applyEdits: ApplyEdits = (_source, _edits) => {
	throw new Error("请先实现 applyEdits。");
};
