type UserMessage = { role: "user"; content: string };

type ReadCall = { type: "toolCall"; id: string; name: "read"; arguments: { path: string } };

type AssistantMessage =
	| { role: "assistant"; stopReason: "toolUse"; content: ReadCall[] }
	| { role: "assistant"; stopReason: "stop"; content: { type: "text"; text: string }[] };

export type ToolResult = { role: "toolResult"; toolCallId: string; content: string; isError: boolean };
type Message = UserMessage | AssistantMessage | ToolResult;

export type ExecutionMode = "parallel" | "sequential";
export type InputMode = "steer" | "followUp";

export type RunToolBatch = (
	calls: readonly ReadCall[],
	execute: (call: ReadCall) => Promise<ToolResult>,
	mode: ExecutionMode,
) => Promise<ToolResult[]>;

export type TakeNextInput = (queues: Record<InputMode, UserMessage[]>, hasToolResults: boolean) => UserMessage[];

// #region scheduling
export const runToolBatch: RunToolBatch = async (calls, execute, mode) => {
	if (mode === "parallel") return Promise.all(calls.map((call) => execute(call)));

	const results: ToolResult[] = [];
	for (const call of calls) results.push(await execute(call));
	return results;
};

export const takeNextInput: TakeNextInput = (queues, hasToolResults) => {
	if (queues.steer.length > 0) return queues.steer.splice(0);
	if (!hasToolResults) return queues.followUp.splice(0);
	return [];
};
// #endregion scheduling

export type Scheduling = { runToolBatch: RunToolBatch; takeNextInput: TakeNextInput };

export const referenceScheduling: Scheduling = { runToolBatch, takeNextInput };

export type RunEvent =
	| { kind: "request"; turn: number; messages: readonly Message[] }
	| { kind: "toolStart"; path: string }
	| { kind: "toolEnd"; path: string; isError: boolean }
	| { kind: "queued"; mode: InputMode }
	| { kind: "turnEnd"; turn: number; results: ToolResult[] }
	| { kind: "answer"; text: string };

type RunOptions = {
	question: string;
	askModel: (messages: readonly Message[]) => Promise<AssistantMessage>;
	read: (path: string, enqueue: (mode: InputMode, text: string) => void) => Promise<string>;
	mode: ExecutionMode;
	onEvent: (event: RunEvent) => void;
};

export async function runAgent({ question, askModel, read, mode, onEvent }: RunOptions, scheduling: Scheduling) {
	const messages: Message[] = [{ role: "user", content: question }];
	const queues: Record<InputMode, UserMessage[]> = { steer: [], followUp: [] };

	function enqueue(mode: InputMode, content: string) {
		queues[mode].push({ role: "user", content });
		onEvent({ kind: "queued", mode });
	}

	async function execute(call: ReadCall): Promise<ToolResult> {
		const { path } = call.arguments;
		onEvent({ kind: "toolStart", path });
		const result: ToolResult = { role: "toolResult", toolCallId: call.id, content: "", isError: false };
		try {
			result.content = await read(path, enqueue);
		} catch (error) {
			result.content = error instanceof Error ? error.message : String(error);
			result.isError = true;
		}
		onEvent({ kind: "toolEnd", path, isError: result.isError });
		return result;
	}

	for (let turn = 1; turn <= 4; turn++) {
		onEvent({ kind: "request", turn, messages: [...messages] });
		const reply = await askModel(messages);
		messages.push(reply);

		const results = reply.stopReason === "toolUse" ? await scheduling.runToolBatch(reply.content, execute, mode) : [];
		messages.push(...results);
		if (reply.stopReason === "stop") {
			onEvent({ kind: "answer", text: reply.content.map((block) => block.text).join("\n") });
		}
		onEvent({ kind: "turnEnd", turn, results });

		const nextInput = scheduling.takeNextInput(queues, results.length > 0);
		if (results.length === 0 && nextInput.length === 0) return;
		messages.push(...nextInput);
	}

	throw new Error("实验超过四轮。请检查工具结果和输入队列。");
}

export function describeEvent(event: RunEvent): string {
	switch (event.kind) {
		case "request": return `请求模型 ${event.turn}`;
		case "toolStart": return `开始读取 ${event.path}`;
		case "toolEnd": return `${event.path} ${event.isError ? "读取失败" : "读取完成"}`;
		case "queued": return `新消息进入 ${event.mode} 队列`;
		case "turnEnd": return event.results.length > 0
			? `第 ${event.turn} 轮结束，结果按 ${event.results.map((result) => result.toolCallId).join("、")} 写入`
			: `第 ${event.turn} 轮结束`;
		case "answer": return event.text;
	}
}
