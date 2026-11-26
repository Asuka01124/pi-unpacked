import { READ_TASK, STEER_MESSAGE, TEST_TASK, type Command, type Record } from "./protocol.ts";

export function createSession(emit: (record: Record) => void, readDelay = 1500, testDelay = 5000) {
	let nextCallId = 1;
	let active: { callId: string; name: string; timer: ReturnType<typeof setTimeout>; steering: string[] } | undefined;

	function finish(aborted: boolean) {
		const run = active;
		if (!run) return;
		active = undefined;
		clearTimeout(run.timer);
		emit({ type: "tool_execution_end", toolName: run.name, toolCallId: run.callId, isError: aborted });
		if (!aborted) {
			for (const content of run.steering) emit({ type: "message_end", message: { role: "user", content } });
			const content = run.steering.includes(STEER_MESSAGE) ? "HTTP 401" : "登录测试预期 HTTP 200，实际 HTTP 401。";
			emit({ type: "message_end", message: { role: "assistant", content } });
		}
		emit({ type: "agent_end" });
		emit({ type: "agent_settled", aborted });
	}

	return {
		receive(command: Command) {
			const reply = (data?: unknown, error?: string) => emit({
				type: "response", id: command.id, command: command.type, success: !error,
				...(error ? { error } : data === undefined ? {} : { data }),
			});
			switch (command.type) {
				case "get_state":
					return reply({ isStreaming: active !== undefined });
				case "prompt": {
					if (active) return reply(undefined, "已有运行，请使用 steer。");
					const test = command.message === TEST_TASK;
					if (!test && command.message !== READ_TASK) return reply(undefined, "请使用本章的固定任务。");
					const name = test ? "simulate_test" : "read";
					const callId = `call-${nextCallId++}`;
					active = { callId, name, timer: setTimeout(() => finish(false), test ? testDelay : readDelay), steering: [] };
					reply({ disposition: "started" });
					emit({ type: "agent_start" });
					emit({ type: "tool_execution_start", toolName: name, toolCallId: callId });
					return;
				}
				case "steer":
					if (!active) return reply(undefined, "当前没有运行。");
					active.steering.push(command.message);
					return reply({ disposition: "queued" });
				case "abort":
					finish(true);
					return reply();
			}
		},
		dispose() {
			if (active) clearTimeout(active.timer);
			active = undefined;
		},
	};
}
