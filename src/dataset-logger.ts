import got from 'got';
import { Counter, Gauge, Registry } from 'prom-client';
import { ADD_EVENT_API_STATUS, DEFAULT_DATASET_URL, ENDPOINT, MAX_EVENTS_PER_BATCH } from './constants';
import { createUrl } from './create-url';
import { flattenNestedObject } from './flatten-nested-object';
import { DataSetEvent, DataSetEventSeverity, DataSetLoggerOptions, DataSetSessionInfo, Metrics } from './types';

export class DataSetLogger {
  private apiKey: string;

  private batchingTime = 3_000;

  private enableMetrics: boolean;

  private isClosed = false;

  private metrics?: Metrics;

  private metricsRegistry?: Registry;

  private metricsPrefix: string;

  private queue: DataSetEvent[] = [];

  private onErrorHandler: NonNullable<DataSetLoggerOptions['onErrorHandler']>;

  private onSuccessHandler: NonNullable<DataSetLoggerOptions['onSuccessHandler']>;

  private serverUrl: string;

  // Arbitrary string (up to 200 chars) that uniquely defines the lifetime of the upload process.
  // An easy way to create the session parameter is to generate a UUID at process startup, then store the
  // value in a global variable. Do not create a new session identifier for each request; if you create
  // too many session identifiers, we may be forced to rate-limit your account.
  // Rate limiting may also occur if the throughput per session exceeds around 12MB/s.
  // If you receive "backoff" (429) errors during sustained periods of high throughput, divide your
  // addEvents activity over multiple sessions.
  // TODO: Implement sessionId rotation on demand
  private sessionId = `${Date.now()}`;

  // Can be used to specify fields associated with the uploading process. These fields can then be used
  // when querying the uploaded events.
  // Should remain the same for all API invocations that share a session value. If not, we might ignore
  // the changes to sessionInfo and associate the original sessionInfo with all events for that session.
  private sessionInfo?: DataSetSessionInfo;

  private shouldFlattenAttributes = false;

  private timeoutId: NodeJS.Timeout | null = null;

  private url: string;

  constructor(options: DataSetLoggerOptions) {
    if (!options.apiKey) {
      throw new Error('apiKey is required');
    }

    this.apiKey = options.apiKey;

    this.enableMetrics = options.enableMetrics ?? false;

    this.metricsPrefix = options.metricsPrefix ?? 'dataset_logger_';

    this.metricsRegistry = options.metricsRegistry;

    this.shouldFlattenAttributes = options.shouldFlattenAttributes ?? false;

    this.sessionInfo = this.shouldFlattenAttributes ? flattenNestedObject(options.sessionInfo) : options.sessionInfo;

    this.serverUrl = options.serverUrl || DEFAULT_DATASET_URL;

    this.onErrorHandler = options.onErrorHandler || (() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    this.onSuccessHandler = options.onSuccessHandler || (() => {}); // eslint-disable-line @typescript-eslint/no-empty-function

    const [err, url] = createUrl(this.serverUrl, ENDPOINT);

    if (err || !url) {
      const errorMessage = ['Could not build the URL', err?.message].filter(Boolean).join('. ');

      throw new Error(errorMessage);
    }

    this.url = url;

    if (this.enableMetrics) {
      const registry = this.metricsRegistry
        ? {
            registers: [this.metricsRegistry],
          }
        : {};
      const queue = this.queue;
      this.metrics = {
        currentQueueLength: new Gauge({
          name: `${this.metricsPrefix}queue_length`,
          help: 'current length of the queue of events to be send to DataSet',
          collect() {
            this.set(queue.length);
          },
          ...registry,
        }),
        failedRequestsCounter: new Counter({
          name: `${this.metricsPrefix}error_requests`,
          help: 'number of failed requests to upload logs to DataSet',
          ...registry,
        }),
        successRequestsCounter: new Counter({
          name: `${this.metricsPrefix}success_requests`,
          help: 'number of successful requests to upload logs to DataSet',
          ...registry,
        }),
      };
    }

    // Init sending events
    this.setTimeout();
  }

  log(event: (Omit<DataSetEvent, 'ts'> & { ts?: DataSetEvent['ts'] }) | string) {
    if (this.isClosed) {
      return;
    }

    const rawEvent = typeof event === 'string' ? { attrs: { message: event } } : event;

    const { attrs, sev, ...restOfEvent } = rawEvent;

    this.queue.push({
      // If no timestamp is provided, use the current time
      ts: new Date().getTime() * 1_000_000, // To nanoseconds
      attrs: this.shouldFlattenAttributes ? flattenNestedObject(attrs) : attrs,
      sev: sev ?? DataSetEventSeverity.INFO,
      ...restOfEvent,
    });

    if (this.queue.length >= MAX_EVENTS_PER_BATCH) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.sendRequest();
    }
  }

  setTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    if (this.isClosed) {
      return;
    }

    this.timeoutId = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.sendRequest();
    }, this.batchingTime);
  }

  close() {
    if (this.isClosed) {
      throw new Error('DataSetLogger is already closed');
    }
    this.isClosed = true;

    return this.sendRequest();
  }

  private async sendRequest() {
    this.setTimeout();

    if (this.queue.length === 0) {
      return false;
    }

    const events = this.queue;
    this.queue = [];

    try {
      const { body } = await got.post<{ message: string; status: string }>(this.url, {
        json: {
          events,
          session: this.sessionId,
          sessionInfo: this.sessionInfo,
          token: this.apiKey,
        },
        responseType: 'json',
        retry: {
          limit: 5,
          methods: ['POST'],
        },
        hooks: {
          afterResponse: [
            (response, retryWithMergedOptions) => {
              // @ts-expect-error TODO: Fix response body type
              const { message, status } = response.body;

              if (status !== ADD_EVENT_API_STATUS.SUCCESS && status !== ADD_EVENT_API_STATUS.BAD_PARAM) {
                // logger.debug({ status, url: this.url }, `addEvent API request was not successful, retrying...`);
                return retryWithMergedOptions({});
              }

              // if (status === ADD_EVENT_API_STATUS.SUCCESS) {
              //   logger.debug({ url: this.url }, 'Successfully sent API request');
              // }

              return response;
            },
          ],
        },
      });

      const { status } = body;

      const isSuccess = status === ADD_EVENT_API_STATUS.SUCCESS;

      if (isSuccess) {
        this.metrics?.successRequestsCounter.inc();
        this.onSuccessHandler(body);

        return true;
      } else {
        this.metrics?.failedRequestsCounter.inc();
        this.onErrorHandler(new Error(body.message));

        return false;
      }
    } catch (error) {
      this.metrics?.failedRequestsCounter.inc();
      this.onErrorHandler(error as Error);

      return false;
    }
  }
}
