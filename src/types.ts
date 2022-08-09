import type { Counter, Gauge, Registry } from 'prom-client';

export enum DataSetEventSeverity {
  INFO = 3,
  WARN = 4,
  ERROR = 5,
  DANGER = 6,
}

export type DataSetEventAttributes = Record<string, unknown>;

export type DataSetEvent = {
  // Identifier for this server thread (optional)
  thread?: string;
  // Event timestamp (nanoseconds since 1/1/1970)
  ts: number;
  // Severity level of the event
  // info: severityLevel <= 3,
  // warn: severityLevel === 4,
  // error: severityLevel === 5,
  // danger: severityLevel > 5,
  sev?: number | DataSetEventSeverity;
  // Event attributes
  attrs: DataSetEventAttributes;
};

export type DataSetSessionInfo = {
  serverHost?: string;
} & { [key in string]: string | number | boolean | Date };

export type DataSetLoggerOptions = {
  apiKey: string;
  enableMetrics?: boolean;
  metricsPrefix?: string;
  metricsRegistry?: Registry;
  serverUrl?: string;
  sessionInfo?: DataSetSessionInfo;
  shouldFlattenAttributes?: boolean;
  onErrorHandler?: (error: Error) => void;
  onSuccessHandler?: (response: unknown) => void;
};

export type Metrics = {
  currentQueueLength: Gauge<string>;
  failedRequestsCounter: Counter<string>;
  successRequestsCounter: Counter<string>;
};
