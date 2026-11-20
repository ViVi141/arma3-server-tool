import { AsyncLocalStorage } from "node:async_hooks";

/** 内部执行上下文，不接受请求体伪造；子操作继承同一任务的取消信号。 */
export const operationSignal = new AsyncLocalStorage<AbortSignal>();
