import type { GetBranch, ProjectMessages } from "./session.ts";

export const getBranch: GetBranch = (_entries, _leafId) => {
	throw new Error("请先实现 getBranch。");
};

export const projectMessages: ProjectMessages = (_branch) => {
	throw new Error("请先实现 projectMessages。");
};
