import { registerTool } from "../chapter-10/bridge.ts";
import { JOB, SERVER } from "../chapter-10/protocol.ts";
import { findUnauthorized } from "./ci-script.js";
import * as reference from "./exposure.ts";
import type { Exposure, InitialTools, LoadMatches } from "./exposure.ts";

export const modes = [
	{ id: "direct", label: "直接声明" },
	{ id: "deferred", label: "搜索后调用" },
	{ id: "codemode", label: "Code Mode" },
	{ id: "hidden", label: "隐藏" },
] as const;

const list = registerTool(SERVER, {
	name: "list-failed-jobs", description: "列出 CI 的失败任务。",
	inputSchema: { type: "object", properties: {}, required: [] },
});
const detail = registerTool(SERVER, {
	name: "get-failed-test", description: "查询一项 CI 任务的失败情况。",
	inputSchema: { type: "object", properties: { job: { type: "string" } }, required: ["job"] },
});
const jobs = [JOB, "route-tests", "status-tests"];
const failures = [
	{ job: JOB, actualStatus: 401, log: "登录请求缺少 Authorization。" },
	{ job: "route-tests", actualStatus: 404, log: "健康检查路由不存在。" },
	{ job: "status-tests", actualStatus: 503, log: "状态服务暂时不可用。" },
];
export const ciTools = [list.name, detail.name];

export function makeCiTools(onCall: (name: string, args: object) => void) {
	return {
		async mcp__ci__list_failed_jobs(args: Record<string, never>) {
			onCall(list.name, args);
			return { content: [{ type: "text", text: jobs.join("、") }], structuredContent: { jobs: [...jobs] } };
		},
		async mcp__ci__get_failed_test(args: { job: string }) {
			onCall(detail.name, args);
			const failure = failures.find(({ job }) => job === args.job);
			if (!failure) throw new Error("找不到这项 CI 任务。");
			const text = `${failure.job}：HTTP ${failure.actualStatus}。${failure.log}`;
			return { content: [{ type: "text", text }], structuredContent: { ...failure } };
		},
	};
}

type Implementation = { initialTools: InitialTools; loadMatches: LoadMatches };
type Request = { tools: string[]; action: string };
type Call = { name: string; args: object; parentToolCallId?: string };

export async function replayDiscovery(exposure: Exposure, implementation: Implementation = reference) {
	const catalog = [list, detail].map((tool) => ({ ...tool, exposure }));
	let active = implementation.initialTools(catalog);
	const requests: Request[] = [];
	const calls: Call[] = [];
	const results: { job: string; actualStatus: number }[] = [];
	const send = (action: string) => requests.push({ tools: [...active], action });
	let modelVisibleResult: unknown = null;

	if (exposure === "hidden") {
		send("没有可用的 CI 工具。");
		return { requests, calls, results, modelVisibleResult };
	}

	const ci = makeCiTools((name, args) => {
		calls.push({ name, args, ...(exposure === "codemode" ? { parentToolCallId: "code-1" } : {}) });
	});
	if (exposure === "deferred") {
		send("调用 tool_search，查询 CI。");
		active = implementation.loadMatches(catalog, active, "CI");
	}
	if (exposure === "codemode") {
		send("调用 codemode。脚本列出失败任务，批量查询，再筛选 HTTP 401。");
		results.push(...await findUnauthorized(ci));
		modelVisibleResult = results;
	} else {
		if (!ciTools.every((name) => active.includes(name))) throw new Error("工具尚未声明给模型。");
		send("调用列表工具。");
		const listResult = await ci.mcp__ci__list_failed_jobs({});
		send("模型根据列表调用各任务的详情工具。");
		const details = await Promise.all(listResult.structuredContent.jobs.map((job) => ci.mcp__ci__get_failed_test({ job })));
		for (const { structuredContent: { job, actualStatus } } of details) {
			if (actualStatus === 401) results.push({ job, actualStatus });
		}
		modelVisibleResult = { list: listResult.content, details: details.map(({ content }) => content) };
	}
	send("根据收到的结果回答用户。");
	return { requests, calls, results, modelVisibleResult };
}
