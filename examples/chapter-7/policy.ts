export const NOTE_PATH = "triage-note.txt";

export type WriteInput = { path: typeof NOTE_PATH; content: string };
export type ParseWriteInput = (input: unknown) => WriteInput | undefined;
export type ApproveWrite = (approved: boolean | undefined) => { block: true; reason: string } | undefined;

// #region policy
export const parseWriteInput: ParseWriteInput = (input) => {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return;
	if (!("path" in input) || input.path !== NOTE_PATH) return;
	if (!("content" in input) || typeof input.content !== "string") return;
	return { path: NOTE_PATH, content: input.content };
};

export const approveWrite: ApproveWrite = (approved) => {
	if (approved === true) return;
	return { block: true, reason: approved === false ? "用户拒绝写入。" : "没有收到批准。" };
};
// #endregion policy
