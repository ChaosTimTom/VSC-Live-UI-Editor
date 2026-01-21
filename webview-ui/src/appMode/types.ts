export type AppModeLayoutApplyMode = 'off' | 'safe' | 'full';
export type AppModeStyleAdapter = 'auto' | 'tailwind' | 'cssClass' | 'inline';
export type AppModeIdentityKind = 'unknown' | 'stable' | 'fallback' | 'unmapped';

export type AppModeViewportPreset =
  | 'responsive'
  | 'iphone14'
  | 'iphone14land'
  | 'iphonese'
  | 'iphoneseland'
  | 'ipad';

export type AppModeApplyReport = {
  kind: 'ok' | 'warn' | 'err';
  text: string;
};

export type AppModeInjectedOpts = {
  iframeUrl: string;
  iframeOrigin: string;
  appLabel: string;
  tauriShimEnabled?: boolean;
};
