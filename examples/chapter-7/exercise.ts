import type { ApproveWrite, ParseWriteInput } from "./policy.ts";

export const parseWriteInput: ParseWriteInput = (_input) => {
	throw new Error("请先实现 parseWriteInput。");
};

export const approveWrite: ApproveWrite = (_approved) => {
	throw new Error("请先实现 approveWrite。");
};
