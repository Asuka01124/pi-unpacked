import { defineConfig } from "vitepress";

export default defineConfig({
	lang: "zh-CN",
	title: "Pi Agent 实验室",
	description: "从一次工具调用开始，动手理解 Pi 的 Agent 循环。",
	themeConfig: {
		nav: [
			{ text: "教程", link: "/" },
			{ text: "Pi 源码", link: "https://github.com/earendil-works/pi" },
		],
		sidebar: [
			{
				text: "从零学习 Agent",
				items: [
					{ text: "第一章：从聊天到行动", link: "/" },
					{ text: "第二章：Pi 怎样驱动一次运行", link: "/chapter-2" },
				],
			},
		],
		outline: { label: "本章目录", level: 2 },
		returnToTopLabel: "回到顶部",
		sidebarMenuLabel: "章节",
		darkModeSwitchLabel: "外观",
		skipToContentLabel: "跳到正文",
		lastUpdated: false,
	},
});
