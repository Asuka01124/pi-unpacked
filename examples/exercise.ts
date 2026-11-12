import type { AskModel, Read, Step } from "./agent-loop.ts";

export async function runExercise(
	_question: string,
	_askModel: AskModel,
	_read: Read,
	_onStep?: (step: Step) => void,
): Promise<string> {
	// TODO：先把用户问题放进消息列表，再请求模型。
	// 收到最终回答就返回。收到工具调用就执行并追加结果，然后继续循环。
	throw new Error("请先实现 examples/exercise.ts 中的 runExercise。");
}
