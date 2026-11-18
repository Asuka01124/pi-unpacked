<script setup lang="ts">
import { computed, ref } from "vue";
import { editCases, log, source } from "../../examples/chapter-4/fixtures.ts";
import { MAX_LINES, applyEdits, readPage } from "../../examples/chapter-4/tools.ts";

const props = defineProps<{ tool: "read" | "edit" }>();
const offset = ref(1);
const page = computed(() => readPage(log, offset.value));
const editCase = ref<keyof typeof editCases>("duplicate");
const editOptions = [
	{ id: "duplicate", label: "重复的 timeout 行" },
	{ id: "unique", label: "带上 loginClient 上下文" },
	{ id: "overlap", label: "同一批修改重叠" },
] as const;

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
	<section v-if="props.tool === 'read'" class="chapter-lab" aria-label="日志分页实验">
		<p><code>read({ path: "test.log", offset: {{ offset }}, limit: {{ MAX_LINES }} })</code></p>
		<pre tabindex="0" aria-label="工具返回的日志和续读提示"><code>{{ page.content }}</code></pre>
		<div class="lab-options">
			<button class="lab-button" type="button" :disabled="offset === 1" @click="offset = 1">回到开头</button>
			<button class="lab-button lab-button-primary" type="button" :disabled="page.nextOffset === undefined" @click="readNextPage">
				{{ page.nextOffset === undefined ? "已读到文件末尾" : `从第 ${page.nextOffset} 行继续` }}
			</button>
		</div>
		<span class="sr-only" role="status">{{ page.content }}</span>
	</section>
	<section v-else class="chapter-lab" aria-label="精确替换实验">
		<fieldset class="lab-fieldset">
			<legend>替换场景</legend>
			<div class="lab-options">
				<button v-for="item in editOptions" :key="item.id" class="lab-button" type="button" :aria-pressed="editCase === item.id" @click="editCase = item.id">
					{{ item.label }}
				</button>
			</div>
		</fieldset>
		<div class="lab-body" aria-live="polite">
			<p class="lab-title">{{ editPreview.error ? "工具报错" : "修改预览" }}</p>
			<p v-if="editPreview.error">{{ editPreview.content }}</p>
			<pre v-else tabindex="0" aria-label="修改后的代码"><code>{{ editPreview.content }}</code></pre>
		</div>
		<details>
			<summary>查看原始代码和替换参数</summary>
			<div class="lab-body">
				<p class="lab-label">原始代码</p>
				<pre tabindex="0" aria-label="原始代码"><code>{{ source }}</code></pre>
				<p class="lab-label"><code>edits</code> 参数</p>
				<pre tabindex="0" aria-label="替换参数"><code>{{ JSON.stringify(editCases[editCase], null, 2) }}</code></pre>
			</div>
		</details>
	</section>
</template>
