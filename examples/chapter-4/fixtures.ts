export const log = [
	"INFO 测试环境已启动",
	"INFO 数据库连接成功",
	"INFO 已装载登录测试数据",
	"INFO 开始执行测试",
	"INFO GET /health → 200",
	"INFO GET /profile → 200",
	"INFO 开始登录测试",
	"INFO POST /login",
	"ERROR 登录测试：预期 HTTP 200，实际 HTTP 401。",
	"INFO 测试结束",
].join("\n");

export const source = `const loginClient = {
  timeout: 1000,
};

const profileClient = {
  timeout: 1000,
};`;

const loginHeader = "const loginClient = {";
const timeout = "  timeout: 1000,";
const updated = "  timeout: 1500,";
const loginBlock = `${loginHeader}\n${timeout}`;

export const editCases = {
	duplicate: [{ oldText: timeout, newText: updated }],
	overlap: [
		{ oldText: loginBlock, newText: `${loginHeader}\n${updated}` },
		{ oldText: loginHeader, newText: "const authClient = {" },
	],
	unique: [{ oldText: loginBlock, newText: `${loginHeader}\n${updated}` }],
};
