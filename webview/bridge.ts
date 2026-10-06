import type { HostMessage, WebviewMessage } from '../src/editor/protocol';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();
let counter = 1;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const listeners: ((message: HostMessage) => void)[] = [];

function complete(id: number, value: unknown): void {
  const entry = pending.get(id);
  if (entry) {
    pending.delete(id);
    entry.resolve(value);
  }
}

function fail(id: number, message: string): void {
  const entry = pending.get(id);
  if (entry) {
    pending.delete(id);
    entry.reject(new Error(message));
  }
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  switch (message.t) {
    case 'lspResult':
      complete(message.id, message.result);
      return;
    case 'uris':
      complete(message.id, message.uris);
      return;
    case 'lspError':
      fail(message.id, message.message);
      return;
    default:
      for (const listener of listeners) {
        listener(message);
      }
  }
});

export const bridge = {
  send(message: WebviewMessage): void {
    api.postMessage(message);
  },
  on(listener: (message: HostMessage) => void): void {
    listeners.push(listener);
  },
  request(method: string, params: unknown): Promise<unknown> {
    const id = counter;
    counter += 1;
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    pending.set(id, { resolve, reject });
    api.postMessage({ t: 'lsp', id, method, params } satisfies WebviewMessage);
    return promise;
  },
  resolvePath(path: string): Promise<string | undefined> {
    const id = counter;
    counter += 1;
    const { promise, resolve, reject } = Promise.withResolvers<Record<string, string>>();
    pending.set(id, {
      resolve: (value) => resolve(value as Record<string, string>),
      reject,
    });
    api.postMessage({ t: 'resolve', id, paths: [path] } satisfies WebviewMessage);
    return promise.then((uris) => uris[path]);
  },
};
