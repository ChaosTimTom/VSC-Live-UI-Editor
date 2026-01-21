export type VsCodeApi = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

export function acquireVsCodeApiSafe(): VsCodeApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyWindow = window as any;
  const api = typeof anyWindow.acquireVsCodeApi === 'function' ? anyWindow.acquireVsCodeApi() : undefined;
  if (api) return api as VsCodeApi;

  return {
    postMessage: () => {},
    getState: () => ({}),
    setState: () => {},
  };
}
