<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import type { ExecutionMode, InputMode, RunEvent } from "../../examples/chapter-2/runtime.ts";
import { EXTRA_INPUT, replayRun } from "../../examples/chapter-2/scenario.ts";
import log from "../../examples/test.log?raw";

const id = useId();
const mode = ref<ExecutionMode>("parallel");
const input = ref<InputMode>("steer");
const events = ref<RunEvent[]>([]);
const loading = ref(true);
const error = ref("");
const timingHelp = ref<"preview" | "open" | null>(null);

const timings = [
	{ value: "steer", label: "引导", hint: "等这批工具执行完，下一次请求就带上补充。" },
	{ value: "followUp", label: "追加", hint: "等模型答完原问题，再把补充发给模型。" },
] as const;
const modes = [
	{ value: "parallel", label: "并发" },
	{ value: "sequential", label: "顺序" },
] as const;

function previewTimingHelp(event: PointerEvent) {
	if (event.pointerType === "mouse" && timingHelp.value === null) timingHelp.value = "preview";
}

function dismissTimingPreview() {
	if (timingHelp.value === "preview") timingHelp.value = null;
}

const requests = computed(() => events.value.filter((event) => event.kind === "request"));
const receivesExtraAt = computed(() => requests.value.find((request) =>
	request.messages.some((message) => message.role === "user" && message.content === EXTRA_INPUT),
)?.turn);
const readingSteps = computed(() => events.value.filter((event) =>
	event.kind === "toolStart" || event.kind === "toolEnd" || event.kind === "queued"
	|| (event.kind === "turnEnd" && event.results.length > 0),
));

watch([mode, input], async ([execution, delivery], _previous, onCleanup) => {
	let stale = false;
	onCleanup(() => { stale = true; });
	loading.value = true;
	error.value = "";
	try {
		const recorded = await replayRun(execution, delivery, log);
		if (!stale) events.value = recorded;
	} catch (cause) {
		if (!stale) {
			events.value = [];
			error.value = cause instanceof Error ? cause.message : String(cause);
		}
	} finally {
		if (!stale) loading.value = false;
	}
}, { immediate: true });
</script>

<template>
	<section class="run-replay" aria-label="比较补充要求的生效时机">
		<p class="run-context">Pi 正在读两份日志。你补了一句：</p>
		<p class="run-quote">「{{ EXTRA_INPUT }}」</p>

		<fieldset class="run-options">
			<legend>补充消息的处理方式</legend>
			<div class="run-choices">
				<label v-for="choice in timings" :key="choice.value">
					<input v-model="input" type="radio" :name="`${id}-input`" :value="choice.value">
					<span>{{ choice.label }}</span>
				</label>
				<div class="run-help" @pointerenter="previewTimingHelp" @pointerleave="dismissTimingPreview">
					<button
						type="button"
						aria-label="引导与追加的区别"
						:aria-expanded="timingHelp !== null"
						:aria-controls="`${id}-timing-help`"
						@click="timingHelp = timingHelp === 'open' ? null : 'open'"
						@blur="timingHelp = null"
						@keydown.esc.stop="timingHelp = null"
					>?</button>
					<div v-show="timingHelp !== null" :id="`${id}-timing-help`" class="run-help-text">
						<p v-for="choice in timings" :key="choice.value">
							<strong>{{ choice.label }}</strong>（<code>{{ choice.value }}</code>）{{ choice.hint }}
						</p>
					</div>
				</div>
			</div>
		</fieldset>

		<div class="run-story" role="status" :aria-busy="loading" aria-atomic="true">
			<template v-if="receivesExtraAt">
				<p class="run-label">接下来发生了什么</p>
				<ol role="list">
					<li>两份日志都处理完了。</li>
					<li v-if="receivesExtraAt > 2">第 2 次请求：模型先回答原问题。</li>
					<li class="run-highlight">第 {{ receivesExtraAt }} 次请求：<strong>模型收到你的补充</strong>，按新要求回答。</li>
				</ol>
			</template>
			<p v-else-if="loading">正在生成回放…</p>
		</div>
		<p v-if="error" role="alert">回放失败：{{ error }}</p>

		<details v-if="requests.length" class="run-more">
			<summary>查看读取顺序和模型消息</summary>
			<div class="run-detail">
				<fieldset class="run-options">
					<legend>工具调度</legend>
					<div class="run-choices">
						<label v-for="choice in modes" :key="choice.value">
							<input v-model="mode" type="radio" :name="`${id}-mode`" :value="choice.value">
							<span>{{ choice.label }}</span>
						</label>
					</div>
				</fieldset>

				<ol class="run-steps" role="list" aria-label="读取记录" :aria-busy="loading">
					<li v-for="(event, index) in readingSteps" :key="index">
						<template v-if="event.kind === 'toolStart'">
							开始读 <code>{{ event.path }}</code>
						</template>
						<template v-else-if="event.kind === 'toolEnd'">
							<code>{{ event.path }}</code> {{ event.isError ? "读取失败" : "读取完成" }}
						</template>
						<template v-else-if="event.kind === 'queued'">
							你发来了补充要求
						</template>
						<template v-else-if="event.kind === 'turnEnd'">
							发给模型的结果顺序：<code>{{ event.results.map((result) => result.toolCallId).join(" → ") }}</code>
						</template>
					</li>
				</ol>

				<div class="run-requests" :aria-busy="loading">
					<details v-for="request in requests" :key="request.turn" :name="`${id}-request`" class="run-request">
						<summary>第 {{ request.turn }} 次请求发给模型的消息</summary>
						<ol class="run-messages" role="list" aria-label="发给模型的消息">
							<li v-for="(message, index) in request.messages" :key="index">
								<template v-if="message.role === 'user'">
									<span class="run-label">{{ message.content === EXTRA_INPUT ? "补充要求" : "原问题" }}</span>
									<span>{{ message.content }}</span>
								</template>
								<template v-else-if="message.role === 'toolResult'">
									<span class="run-label">工具结果 · <code>{{ message.toolCallId }}</code></span>
									<span>{{ message.content.trim() }}</span>
								</template>
								<template v-else-if="message.stopReason === 'toolUse'">
									<span class="run-label">模型要求读取</span>
									<span v-for="call in message.content" :key="call.id"><code>{{ call.arguments.path }}</code>（<code>{{ call.id }}</code>）</span>
								</template>
								<template v-else>
									<span class="run-label">模型之前的回复</span>
									<span v-for="(block, blockIndex) in message.content" :key="blockIndex">{{ block.text }}</span>
								</template>
							</li>
						</ol>
						<details class="run-raw">
							<summary>查看 JSON</summary>
							<pre tabindex="0" :aria-label="`第 ${request.turn} 次请求的消息数组`"><code>{{ JSON.stringify(request.messages, null, 2) }}</code></pre>
						</details>
					</details>
				</div>
			</div>
		</details>
	</section>
</template>

<style scoped>
.run-replay {
	--run-text: #181818;
	--run-muted: #575757;
	--run-surface: #f5f5f5;
	--run-pill: #e9e9e9;
	--run-hover: #dfdfdf;
	--run-active: #171717;
	--run-on-active: #fff;
	--run-line: #dadada;
	--run-dot: #9b9b9b;
	--run-accent: #0879ce;

	margin: 24px 0;
	padding: 24px 28px 16px;
	border-radius: 20px;
	background: var(--run-surface);
	color: var(--run-text);
	font-size: 15px;
	line-height: 1.65;
	overflow-wrap: anywhere;
}

.dark .run-replay {
	--run-text: #f4f4f4;
	--run-muted: #b8b8b8;
	--run-surface: #242424;
	--run-pill: #353535;
	--run-hover: #424242;
	--run-active: #f4f4f4;
	--run-on-active: #171717;
	--run-line: #444;
	--run-dot: #777;
	--run-accent: #6bbcff;
}

.run-replay p { margin: 0; }
.run-context, .run-label { color: var(--run-muted); font-size: 14px; }
.run-replay .run-quote {
	margin: 6px 0 20px;
	font-size: clamp(18px, 3.8vw, 22px);
	line-height: 1.5;
	font-weight: 650;
}

.run-options { min-width: 0; margin: 0; padding: 0; border: 0; }
.run-options legend { margin-bottom: 8px; padding: 0; font-weight: 600; }
.run-choices { position: relative; display: flex; flex-wrap: wrap; gap: 8px; }
.run-choices label { position: relative; max-width: 100%; cursor: pointer; }
.run-choices input {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
}
.run-choices span {
	display: grid;
	place-items: center;
	min-height: 44px;
	padding: 6px 14px;
	border-radius: 999px;
	background: var(--run-pill);
	font-size: 14px;
	font-weight: 600;
	text-align: center;
}
.run-choices label:hover span { background: var(--run-hover); }
.run-choices input:checked + span { background: var(--run-active); color: var(--run-on-active); }
.run-choices input:focus-visible + span,
.run-help button:focus-visible,
.run-replay summary:focus-visible,
.run-raw pre:focus-visible {
	outline: 2px solid var(--run-active);
	outline-offset: 3px;
}

.run-help button {
	position: relative;
	width: 44px;
	min-height: 44px;
	border-radius: 50%;
	color: var(--run-muted);
	font-weight: 600;
	cursor: help;
}
.run-help button:hover, .run-help button[aria-expanded="true"] { background: var(--run-pill); }
.run-help button::after {
	content: "";
	position: absolute;
	inset: 12px;
	border: 1px solid currentColor;
	border-radius: 50%;
}
.run-help-text {
	position: absolute;
	inset: 100% auto auto 0;
	z-index: 1;
	width: min(100%, 25rem);
	padding: 12px 14px;
	border: 1px solid var(--run-line);
	border-radius: 10px;
	background: var(--vp-c-bg);
	color: var(--run-text);
	font-size: 14px;
}
.run-help-text p + p { margin-top: 6px; }

.run-story { margin: 22px 0 14px; }
.run-replay ol { margin: 0; padding: 0; list-style: none; }
.run-replay ol > li { margin: 0; }
.run-story li, .run-steps li {
	position: relative;
	padding: 5px 0 5px 18px;
}
.run-story li::before, .run-steps li::before {
	content: "";
	position: absolute;
	top: 0.93em;
	left: 1px;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--run-dot);
}
.run-story .run-highlight::before { background: var(--run-accent); }
.run-story .run-label { margin-bottom: 4px; }

.run-more, .run-request { border-top: 1px solid var(--run-line); }
.run-replay summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	min-height: 44px;
	margin: 0;
	padding: 6px 3px 6px 0;
	list-style: none;
	color: var(--run-muted);
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
}
.run-replay summary::-webkit-details-marker { display: none; }
.run-replay summary:hover { color: var(--run-text); }
.run-replay summary::after {
	content: "";
	flex: 0 0 7px;
	height: 7px;
	border-right: 1.5px solid currentColor;
	border-bottom: 1.5px solid currentColor;
	transform: rotate(45deg);
}
.run-replay details[open] > summary::after { transform: rotate(225deg); }
.run-detail { padding: 8px 0 0; }
.run-replay .run-steps { margin: 10px 0 14px; font-size: 14px; }
.run-messages li { display: grid; gap: 2px; padding: 4px 0 10px; }
.run-replay li code { background: var(--run-pill); color: var(--run-text); }
.run-raw pre {
	max-height: 20rem;
	margin: 0 0 10px;
	padding: 12px;
	overflow: auto;
	border-radius: 10px;
	background: var(--run-pill);
	white-space: pre-wrap;
}
.run-raw pre code { padding: 0; background: transparent; color: inherit; font-size: 13px; }

@media (max-width: 520px) {
	.run-replay { padding: 20px 16px 12px; }
}
</style>
