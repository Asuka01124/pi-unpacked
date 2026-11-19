import type { Message } from "../agent-loop.ts";
import type { Entry } from "./session.ts";

const assistant = (text: string): Message => ({ role: "assistant", stopReason: "stop", text });
const user = (content: string): Message => ({ role: "user", content });
const timestamp = "2026-01-01T00:00:00.000Z";

export const sharedId = "base";
export const branches = [
	{ id: "credentials", label: "凭据调查", leafId: "cred-reply" },
	{ id: "route", label: "路由调查", leafId: "route-reply" },
] as const;

export function makeSession() {
	const entries: Entry[] = [];
	let leafId: string | null = null;

	function appendMessage(id: string, message: Message) {
		entries.push({ type: "message", id, parentId: leafId, timestamp, message });
		leafId = id;
	}

	appendMessage("question", user("读取 test.log，告诉我登录测试为什么失败。"));
	appendMessage("read-call", {
		role: "assistant", stopReason: "toolUse",
		toolCall: { id: "read_1", name: "read", arguments: { path: "test.log" } },
	});
	appendMessage("read-result", {
		role: "toolResult", toolCallId: "read_1", content: "第 9 行：登录测试预期 HTTP 200，实际 HTTP 401。", isError: false,
	});
	appendMessage(sharedId, assistant("第 9 行出现 HTTP 401。还需要调查请求为什么未获授权。"));

	appendMessage("cred-question", user("先查测试请求有没有携带凭据。"));
	entries.push({
		type: "custom", id: "cred-state", parentId: leafId, timestamp,
		customType: "triage-mode", data: { enabled: true },
	});
	leafId = "cred-state";
	appendMessage("cred-reply", assistant("先核对 Authorization 头是否由测试客户端发出。"));

	// 对应 /tree 选中共同的助手回复，此后的新问题从这个节点继续。
	leafId = sharedId;
	appendMessage("route-question", user("先查测试请求是否走到了预期的登录路由。"));
	appendMessage("route-reply", assistant("先核对测试请求的路径与路由配置。"));
	return entries;
}

export function encodeSession(entries: readonly Entry[]): string {
	const header = { type: "session", version: 3, id: "session-lab", cwd: "/workspace", timestamp };
	return [header, ...entries].map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

export function decodeSession(source: string): Entry[] {
	const [header, ...rows] = source.trimEnd().split("\n");
	if (JSON.parse(header).type !== "session") throw new Error("首行应为会话头。");
	return rows.map((row) => JSON.parse(row) as Entry);
}
