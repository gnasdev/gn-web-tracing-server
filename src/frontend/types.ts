// Console types

export interface ConsoleLogEntry {
  source?: string;
  level?: string;
  timestamp: number;
  message?: string;
  args?: RemoteObjectValue[];
  stackTrace?: StackFrameEntry[];
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  originalSource?: string;
  originalLine?: number;
  originalColumn?: number;
  relativeMs: number;
}

export interface RemoteObjectValue {
  type: string;
  subtype?: string;
  value?: unknown;
  description?: string;
  className?: string;
  preview?: ObjectPreviewValue;
}

export interface ObjectPreviewValue {
  type: string;
  subtype?: string;
  description?: string;
  overflow?: boolean;
  properties?: PropertyPreviewValue[];
  entries?: EntryPreviewValue[];
}

export interface PropertyPreviewValue {
  name: string;
  type: string;
  value?: string;
  subtype?: string;
  valuePreview?: ObjectPreviewValue;
}

export interface EntryPreviewValue {
  key?: ObjectPreviewValue;
  value: ObjectPreviewValue;
}

export interface StackFrameEntry {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  asyncBoundary?: string;
  originalSource?: string;
  originalLine?: number;
  originalColumn?: number;
  originalName?: string;
}

// Network types

export interface NetworkLogEntry {
  request?: {
    method?: string;
    url?: string;
    headers?: HeaderItem[] | Record<string, string>;
    postData?: { text?: string } | string;
  };
  response?: {
    status?: number;
    statusText?: string;
    headers?: HeaderItem[] | Record<string, string>;
    content?: ContentInfo;
  };
  method?: string;
  url?: string;
  status?: number;
  requestHeaders?: HeaderItem[] | Record<string, string>;
  responseHeaders?: HeaderItem[] | Record<string, string>;
  postData?: string;
  resourceType?: string;
  encodedDataLength?: number;
  wallTime?: number;
  timestamp?: number;
  timings?: Record<string, number>;
  timing?: Record<string, number>;
  initiator?: InitiatorInfo;
  error?: string;
  redirectChain?: RedirectInfo[];
  relativeMs: number;
}

export interface HeaderItem {
  name: string;
  value: string;
}

export interface ContentInfo {
  size?: number;
  mimeType?: string;
  text?: string;
  encoding?: string;
}

export interface InitiatorInfo {
  type?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  originalSource?: string;
  originalLine?: number;
  originalColumn?: number;
  stack?: StackInfo;
}

export interface StackInfo {
  callFrames?: StackFrameInfo[];
  parent?: StackInfo;
  description?: string;
}

export interface StackFrameInfo {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  originalName?: string;
  originalSource?: string;
  originalLine?: number;
  originalColumn?: number;
}

export interface RedirectInfo {
  url?: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

export interface WsLogEntry {
  url?: string;
  frames?: WsFrame[];
  closed?: boolean;
}

export interface WsFrame {
  direction?: string;
  payloadData?: string;
}

// Timeline marker

export interface TimelineMarker {
  timeMs: number;
  color: string;
  label?: string;
}

// Recording metadata

export interface RecordingMetadata {
  url?: string;
  duration?: number;
  startTime?: number;
  timestamp?: string;
}
