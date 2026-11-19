import { defineConfig } from "vitepress";

export default defineConfig({
	lang: "zh-CN",
	base: process.env.PAGES_BASE_PATH ? `${process.env.PAGES_BASE_PATH.replace(/\/+$/, "")}/` : "/",
	title: "拆开 Pi",
	description: "动手复现一个编码 Agent",
	themeConfig: {
		nav: [
			{ text: "教程", link: "/" },
			{ text: "Pi 源码", link: "https://github.com/earendil-works/pi" },
		],
		sidebar: [
			{
				text: "动手复现一个编码 Agent",
				items: [
					{ text: "第一章：从聊天到行动", link: "/" },
					{ text: "第二章：Pi 怎样驱动一次运行", link: "/chapter-2" },
					{ text: "第三章：一个循环怎样接不同模型", link: "/chapter-3" },
					{ text: "第四章：设计编码工具", link: "/chapter-4" },
					{ text: "第五章：AGENTS.md、Skills 与提示词模板", link: "/chapter-5" },
					{ text: "第六章：用 Extensions 改造 Pi", link: "/chapter-6" },
					{ text: "第七章：权限到底在哪一层生效", link: "/chapter-7" },
					{ text: "第八章：会话为什么是一棵树", link: "/chapter-8" },
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
