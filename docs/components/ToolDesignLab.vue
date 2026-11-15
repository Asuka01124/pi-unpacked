<script setup lang="ts">
import { computed, ref } from "vue";
import { editCases, log, source } from "../../examples/chapter-4/fixtures.ts";
import { MAX_LINES, applyEdits, readPage } from "../../examples/chapter-4/tools.ts";

const props = defineProps<{ tool: "read" | "edit" }>();
const offset = ref(1);
const page = computed(() => readPage(log, offset.value));
const editCase = ref<keyof typeof editCases>("duplicate");

function readNextPage() {
	const next = page.value.nextOffset;
	if (next !== undefined) offset.value = next;
}

const editPreview = computed(() => {
	try {
		return { content: applyEdits(source, editCases[editCase.value]), error: false };
	} catch (cause) {
		return { content: cause instanceof Error ? cause.message : String(cause), error: true };
	}
});
</script>

<template>
	<section v-if="props.tool === 'read'" class="tool-lab" aria-label="日志分页实验">
		<p class="invocation"><code>read({ path: "test.log", offset: {{ offset }}, limit: {{ MAX_LINES }} })</code></p>
		<pre tabindex="0" aria-label="工具返回的日志和续读提示"><code>{{ page.content }}</code></pre>
		<div class="actions">
			<button type="button" :disabled="offset === 1" @click="offset = 1">回到开头</button>
			<button type="button" :disabled="page.nextOffset === undefined" @click="readNextPage">
				{{ page.nextOffset === undefined ? "已读到文件末尾" : `从第 ${page.nextOffset} 行继续` }}
			</button>
		</div>
		<span class="sr-only" role="status">{{ page.content }}</span>
	</section>
	<section v-else class="tool-lab" aria-label="精确替换实验">
		<label class="scenario">选择替换场景
			<select v-model="editCase">
				<option value="duplicate">只提供重复的 timeout 行</option>
				<option value="unique">带上 loginClient 上下文</option>
				<option value="overlap">同一批修改重叠</option>
			</select>
		</label>
		<div class="edit-layout">
			<div>
				<p class="panel-label">原始代码</p>
				<pre tabindex="0" aria-label="原始代码"><code>{{ source }}</code></pre>
			</div>
			<div>
				<p class="panel-label"><code>edits</code> 参数</p>
				<pre tabindex="0" aria-label="替换参数"><code>{{ JSON.stringify(editCases[editCase], null, 2) }}</code></pre>
			</div>
		</div>
		<div aria-live="polite">
			<p class="panel-label">{{ editPreview.error ? "工具报错" : "修改预览" }}</p>
			<pre tabindex="0" :aria-label="editPreview.error ? '工具报错内容' : '修改后的代码'"><code>{{ editPreview.content }}</code></pre>
		</div>
	</section>
</template>

<style scoped>
.tool-lab {
	margin: 20px 0 32px;
	padding: 16px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 16px;
}
.tool-lab .invocation { margin: 0; overflow-wrap: anywhere; }
.tool-lab .panel-label { margin: 12px 0 0; font-size: 14px; font-weight: 600; }
.tool-lab pre {
	max-height: 18rem;
	margin: 8px 0 0;
	padding: 12px;
	border-radius: 10px;
	background: var(--vp-code-block-bg);
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.tool-lab pre code { padding: 0; color: inherit; background: transparent; font-size: 13px; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.scenario { display: grid; gap: 4px; width: fit-content; max-width: 100%; font-size: 14px; font-weight: 600; }
.tool-lab button, .tool-lab select {
	min-height: 44px;
	max-width: 100%;
	padding: 0 12px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-c-bg);
	color: var(--vp-c-text-1);
	cursor: pointer;
}
.tool-lab button:disabled { opacity: .55; cursor: default; }
.tool-lab button:not(:disabled):hover { background: var(--vp-c-brand-soft); }
.edit-layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 640px) { .edit-layout { grid-template-columns: minmax(0, 1fr); gap: 0; } }
</style>
