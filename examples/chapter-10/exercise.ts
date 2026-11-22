import type { RegisterTool, ToToolResult } from "./bridge.ts";

export const registerTool: RegisterTool = (_server, _tool) => {
	throw new Error("请先实现 registerTool。");
};

export const toToolResult: ToToolResult = (_result) => {
	throw new Error("请先实现 toToolResult。");
};
