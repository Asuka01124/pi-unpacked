import type { RunToolBatch, TakeNextInput } from "./runtime.ts";

export const runToolBatch: RunToolBatch = async (_calls, _execute, _mode) => {
	throw new Error("请先实现 runToolBatch。");
};

export const takeNextInput: TakeNextInput = (_queues, _hasToolResults) => {
	throw new Error("请先实现 takeNextInput。");
};
