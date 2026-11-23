// 这段固定程序也可以作为 Pi Code Mode 的脚本主体运行。
// #region script
export async function findUnauthorized(tools) {
	const { structuredContent: jobsResult } = await tools.mcp__ci__list_failed_jobs({});
	const failures = await Promise.all(jobsResult.jobs.map(async (job) => {
		const { structuredContent } = await tools.mcp__ci__get_failed_test({ job });
		return structuredContent;
	}));
	return failures
		.filter(({ actualStatus }) => actualStatus === 401)
		.map(({ job, actualStatus }) => ({ job, actualStatus }));
}
// #endregion script
