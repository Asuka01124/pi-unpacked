import type { CreateReader, RouteRecord } from "./protocol.ts";

export const createReader: CreateReader = (_onLine) => {
	throw new Error("请先实现 createReader。");
};

export const routeRecord: RouteRecord = (_record, _pending, _onEvent) => {
	throw new Error("请先实现 routeRecord。");
};
