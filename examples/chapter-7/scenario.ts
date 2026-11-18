import * as reference from "./policy.ts";
import { NOTE_PATH, type ApproveWrite, type ParseWriteInput, type WriteInput } from "./policy.ts";

export const scenarios = [
	{ id: "hidden", label: "未暴露" },
	{ id: "invalid", label: "参数无效" },
	{ id: "denied", label: "审批拒绝" },
	{ id: "readonly", label: "文件系统只读" },
	{ id: "success", label: "写入成功" },
] as const;

export type Scenario = typeof scenarios[number]["id"];
type Policy = { parseWriteInput: ParseWriteInput; approveWrite: ApproveWrite };
type Write = (input: WriteInput) => void | Promise<void>;
type Stage = "查找工具" | "校验参数" | "执行前审批" | "文件写入";
type Event = { stage: Stage; ok: boolean; detail: string };

export const NOTE = "登录测试：首个 HTTP 401 出现在第 9 行。\n";

export async function replayWrite(id: Scenario, write: Write, policy: Policy = reference) {
	const activeTools = id === "hidden" ? ["read"] : ["read", "write"];
	const request = { name: "write", arguments: { path: NOTE_PATH, content: id === "invalid" ? 401 : NOTE } };
	const events: Event[] = [];
	const record = (stage: Stage, ok: boolean, detail: string) => events.push({ stage, ok, detail });
	const trace = { request, activeTools, events };

	if (!activeTools.includes(request.name)) {
		record("查找工具", false, "活动工具里没有 write。");
		return trace;
	}
	record("查找工具", true, "找到 write。");

	const args = policy.parseWriteInput(request.arguments);
	if (!args) {
		record("校验参数", false, "content 必须是字符串，且目标必须是实验文件。");
		return trace;
	}
	record("校验参数", true, "路径和内容通过校验。");

	const decision = policy.approveWrite(id !== "denied");
	if (decision?.block) {
		record("执行前审批", false, decision.reason);
		return trace;
	}
	record("执行前审批", true, "这次调用已获批准。");

	try {
		await write(args);
		record("文件写入", true, `已写入 ${args.path}。`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		record("文件写入", false, message);
	}
	return trace;
}

// 网页用替身模拟文件系统，终端的可写分支可以调用真正的写入函数。
export function simulateReadOnly(): never {
	throw new Error("EROFS：目标文件系统为只读（模拟）。");
}
