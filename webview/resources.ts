import { bridge } from './bridge';

const resolved = new Map<string, string>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<string | undefined>>();

export function imageSource(source: string): string | undefined {
  return resolved.get(source);
}

export function resolveImage(source: string): Promise<string | undefined> {
  const known = resolved.get(source);
  if (known !== undefined) {
    return Promise.resolve(known);
  }
  if (failed.has(source)) {
    return Promise.resolve(undefined);
  }
  const running = inflight.get(source);
  if (running) {
    return running;
  }
  const request = bridge.resolvePath(source).then(
    (uri) => {
      inflight.delete(source);
      if (uri) {
        resolved.set(source, uri);
      } else {
        failed.add(source);
      }
      return uri;
    },
    () => {
      inflight.delete(source);
      failed.add(source);
      return undefined;
    },
  );
  inflight.set(source, request);
  return request;
}
