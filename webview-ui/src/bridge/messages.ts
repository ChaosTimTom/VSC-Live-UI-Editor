export type SetDocumentMessage = {
  command: 'setDocument';
  file: string;
  html: string;
};

export type PreviewStyleMessage = {
  command: 'previewStyle';
  file: string;
  line: number;
  style: Record<string, string>;
};

export type ClearPreviewMessage = {
  command: 'clearPreview';
};

export type RequestTargetsMessage = {
  command: 'requestTargets';
  requestId: string;
  selector: string;
};

export type ElementClickedMessage = {
  command: 'elementClicked';
  file: string;
  line: number;
  column?: number;
};

export type ElementSelectedMessage = {
  command: 'elementSelected';
  file: string;
  line: number;
  column?: number;
  elementContext?: {
    tagName: string;
    id?: string;
    classList?: string[];
    role?: string;
    href?: string;
    type?: string;
    text?: string;
  };
  ancestors?: Array<{ tagName: string; classList?: string[] }>;
  selectionHints?: {
    isScrollContainer?: boolean;
    isInsideScroll?: boolean;
    isRepeatedItem?: boolean;
    responsiveContainer?: boolean;
    scrollContainer?: { tagName: string; classList?: string[] } | null;
    itemRoot?: { tagName: string; classList?: string[] } | null;
  };
  inlineStyle?: string;
  computedStyle?: Record<string, string>;
};

export type TargetsListMessage = {
  command: 'targetsList';
  requestId: string;
  targets: Array<{ file: string; line: number }>;
};

export type UpdateStyleMessage = {
  command: 'updateStyle';
  file: string;
  line: number;
  style: {
    width?: string;
    height?: string;
    transform?: string;
  };
};

export type UpdateTextMessage = {
  command: 'updateText';
  file: string;
  line: number;
  column?: number;
  elementId?: string;
  elementContext?: {
    tagName: string;
    id?: string;
    classList?: string[];
    role?: string;
    href?: string;
    type?: string;
    text?: string;
  };
  text: string;
};

export type PickTargetFileMessage = {
  command: 'pickTargetFile';
  kind: 'html' | 'react' | 'any' | 'active' | 'sample';
};

export type DetectionReportApp = {
  root: string;
  label: string;
  framework: 'vite' | 'next' | 'cra' | 'astro' | 'sveltekit' | 'angular' | 'vue' | 'nuxt' | 'gatsby' | 'remix' | 'generic';
  devScript?: 'dev' | 'start';
  scriptName?: string;
  defaultPort?: number;
  isTauri?: boolean;
};

export type DetectionReportHtmlCandidate = {
  fileId: string;
  label: string;
  score?: number;
  reason?: string;
};

export type DetectionReportPreviewTarget = {
  id: string;
  label: string;
  root: string;
  scriptName?: string;
  defaultPort?: number;
  urlPath?: string;
  kind?: 'storybook' | 'ladle' | 'styleguidist' | 'docusaurus' | 'vitepress' | 'vuepress' | 'docsify' | 'react-cosmos' | 'vite-mpa' | 'custom';
};

export type DetectionReport = {
  apps: DetectionReportApp[];
  htmlCandidates: DetectionReportHtmlCandidate[];
  previewTargets?: DetectionReportPreviewTarget[];
  environment?: {
    isRemote?: boolean;
    isWsl?: boolean;
    isContainer?: boolean;
  };
};

export type AutoInstallDepsMessage = {
  command: 'autoInstallDeps';
  root?: string;
};

export type QuickStartMessage = {
  command: 'quickStart';
  mode: 'static' | 'app';
  static?: {
    target?: 'htmlPicker' | 'active' | 'sample' | 'file';
    fileId?: string;
  };
  app?: {
    connect?: 'integrated' | 'external' | 'existing';
    url?: string;
    appRoot?: string;
    framework?: DetectionReportApp['framework'];
    devScript?: 'dev' | 'start';
    scriptName?: string;
    defaultPort?: number;
    urlPath?: string;
    styleAdapterPref?: 'auto' | 'tailwind' | 'cssClass' | 'inline';
    layoutApplyMode?: 'off' | 'safe' | 'full';
    startBackend?: boolean;
  };
};

export type QuickStartInfoMessage = {
  command: 'quickStartInfo';
  info: {
    hasWorkspace: boolean;
    packageManager?: 'pnpm' | 'yarn' | 'npm';
    appsDetected?: Array<{ framework: 'vite' | 'next' | 'cra' | 'astro' | 'sveltekit' | 'angular' | 'vue' | 'nuxt' | 'gatsby' | 'remix' | 'generic'; label: string }>;
    recommendedMode: 'html' | 'app';
    recommendedUrl?: string;
    recommendedConnect?: 'existing' | 'integrated';
    devHint?: string;
    installHint?: string;
    notes?: string[];
    report?: DetectionReport;
  };
};

export type ToWebviewMessage = SetDocumentMessage | PreviewStyleMessage | ClearPreviewMessage | RequestTargetsMessage | QuickStartInfoMessage;
export type FromWebviewMessage =
  | ElementClickedMessage
  | ElementSelectedMessage
  | TargetsListMessage
  | UpdateStyleMessage
  | UpdateTextMessage
  | PickTargetFileMessage
  | AutoInstallDepsMessage
  | QuickStartMessage;

export function isToWebviewMessage(value: unknown): value is ToWebviewMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.command === 'setDocument') {
    return typeof v.file === 'string' && typeof v.html === 'string';
  }
  if (v.command === 'previewStyle') {
    return typeof v.file === 'string' && typeof v.line === 'number' && typeof v.style === 'object' && !!v.style;
  }
  if (v.command === 'clearPreview') {
    return true;
  }
  if (v.command === 'requestTargets') {
    return typeof v.requestId === 'string' && typeof v.selector === 'string';
  }
  if (v.command === 'quickStartInfo') {
    if (!v.info || typeof v.info !== 'object') return false;
    const info = v.info as Record<string, unknown>;
    const hwOk = typeof info.hasWorkspace === 'boolean';
    const pmOk = info.packageManager === undefined || info.packageManager === 'pnpm' || info.packageManager === 'yarn' || info.packageManager === 'npm';
    const modeOk = info.recommendedMode === 'html' || info.recommendedMode === 'app';
    const urlOk = info.recommendedUrl === undefined || typeof info.recommendedUrl === 'string';
    const connectOk = info.recommendedConnect === undefined || info.recommendedConnect === 'existing' || info.recommendedConnect === 'integrated';
    const devOk = info.devHint === undefined || typeof info.devHint === 'string';
    const installOk = info.installHint === undefined || typeof info.installHint === 'string';
    const appsOk = info.appsDetected === undefined || Array.isArray(info.appsDetected);
    const reportOk = info.report === undefined || (typeof info.report === 'object' && !!info.report);
    return hwOk && pmOk && modeOk && urlOk && connectOk && devOk && installOk && appsOk && reportOk;
  }
  return false;
}
