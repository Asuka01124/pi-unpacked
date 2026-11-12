export type ToolCall = { id: string; name: "read"; arguments: { path: string } };

export type AssistantMessage =
	| { role: "assistant"; stopReason: "stop"; text: string }
	| { role: "assistant"; stopReason: "toolUse" | "length"; toolCall: ToolCall };

export type ToolResult = { role: "toolResult"; toolCallId: string; content: string; isError: boolean };
export type Message = { role: "user"; content: string } | AssistantMessage | ToolResult;

export type Step =
	| { kind: "request"; turn: number; messages: readonly Message[] }
	| { kind: "response"; message: AssistantMessage }
	| { kind: "tool"; call: ToolCall }
	| { kind: "result"; message: ToolResult };

export type AskModel = (messages: readonly Message[]) => Promise<AssistantMessage>;
export type Read = (path: string) => Promise<string>;

// #region loop
export async function runAgent(
	question: string,
	askModel: AskModel,
	read: Read,
	onStep?: (step: Step) => void,
): Promise<string> {
	const messages: Message[] = [{ role: "user", content: question }];

	for (let turn = 1; turn <= 4; turn++) {
		onStep?.({ kind: "request", turn, messages: [...messages] });
		const reply = await askModel(messages);
		messages.push(reply);
		onStep?.({ kind: "response", message: reply });
		if (reply.stopReason === "stop") return reply.text;

		const call = reply.toolCall;
		const result: ToolResult = {
			role: "toolResult",
			toolCallId: call.id,
			content: "",
			isError: false,
		};

		if (reply.stopReason === "length") {
			result.content = "模型输出达到长度上限，请用完整参数重新发起调用。";
			result.isError = true;
		} else {
			onStep?.({ kind: "tool", call });
			try {
				result.content = await read(call.arguments.path);
			} catch (error) {
				result.content = error instanceof Error ? error.message : String(error);
				result.isError = true;
			}
		}

		messages.push(result);
		onStep?.({ kind: "result", message: result });
	}

	throw new Error("已达到四轮上限。");
}
// #endregion loop
