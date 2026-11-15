export type Page = { content: string; nextOffset?: number };
export type ReadPage = (text: string, offset?: number, limit?: number) => Page;
export type Edit = { oldText: string; newText: string };
export type ApplyEdits = (source: string, edits: readonly Edit[]) => string;

export const MAX_LINES = 4;
export const MAX_BYTES = 160;
const encoder = new TextEncoder();

// #region read
export const readPage: ReadPage = (text, offset = 1, limit = MAX_LINES) => {
	if (!Number.isSafeInteger(offset) || offset < 1) throw new Error("offset 必须是从 1 开始的整数。");
	if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("limit 必须是正整数。");

	const lines = text === "" ? [] : text.split(/\r?\n/);
	if (text.endsWith("\n")) lines.pop();
	if (offset === 1 && lines.length === 0) return { content: "文件为空。" };
	if (offset > lines.length) throw new Error(`offset ${offset} 超出范围。文件共 ${lines.length} 行。`);

	const page: string[] = [];
	let bytes = 0;
	for (const line of lines.slice(offset - 1, offset - 1 + Math.min(limit, MAX_LINES))) {
		const lineBytes = encoder.encode(line).length + (page.length ? 1 : 0);
		if (bytes + lineBytes > MAX_BYTES) break;
		bytes += lineBytes;
		page.push(line);
	}
	if (page.length === 0) throw new Error(`第 ${offset} 行超过 ${MAX_BYTES} 字节。请缩小搜索范围或读取该行的片段。`);

	const content = page.join("\n");
	const end = offset + page.length - 1;
	if (end === lines.length) return { content };

	const nextOffset = end + 1;
	return { content: `${content}\n\n[已显示第 ${offset}–${end} 行，共 ${lines.length} 行。用 offset=${nextOffset} 继续。]`, nextOffset };
};
// #endregion read

// #region edit
export const applyEdits: ApplyEdits = (source, edits) => {
	if (edits.length === 0) throw new Error("请提供至少一项替换。");
	const ranges = edits.map(({ oldText, newText }) => {
		if (oldText === "") throw new Error("oldText 不能为空。");
		const start = source.indexOf(oldText);
		if (start === -1) throw new Error("找不到 oldText。请重新读取目标代码。");
		if (source.indexOf(oldText, start + 1) !== -1) {
			throw new Error("oldText 匹配多处。请补充上下文，让目标唯一。");
		}
		return { start, end: start + oldText.length, newText };
	}).sort((a, b) => a.start - b.start);

	for (let index = 1; index < ranges.length; index++) {
		if (ranges[index].start < ranges[index - 1].end) {
			throw new Error("两项修改重叠。请合并为一次替换。");
		}
	}

	let result = source;
	for (const { start, end, newText } of ranges.reverse()) {
		result = result.slice(0, start) + newText + result.slice(end);
	}
	return result;
};
// #endregion edit
