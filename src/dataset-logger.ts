import got from 'got';
import { API_RESPONSE_STATUS, DEFAULT_DATASET_URL, ENDPOINT_ADD_EVENTS, MAX_EVENTS_PER_BATCH } from './constants';
import { flattenNestedObject } from './flatten-nested-object';
import { DataSetEvent, DataSetEventSeverity, DataSetLoggerOptions, DataSetSessionInfo } from './types';
import { buildError, createUrl } from './utils';

export class DataSetLogger {
  private apiKey: string;

  private serverUrl: string;

  private onErrorHandler: NonNullable<DataSetLoggerOptions['onErrorHandler']>;

  private onSuccessHandler: NonNullable<DataSetLoggerOptions['onSuccessHandler']>;

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

  private queue: DataSetEvent[] = [];

  private isClosed = false;

  private batchingTime = 3_000;

  constructor(options: DataSetLoggerOptions) {
    if (!options.apiKey) {
      throw new Error('apiKey is required');
    }

    this.apiKey = options.apiKey;

    this.shouldFlattenAttributes = options.shouldFlattenAttributes ?? false;

    this.sessionInfo = this.shouldFlattenAttributes ? flattenNestedObject(options.sessionInfo) : options.sessionInfo;

    this.serverUrl = options.serverUrl || DEFAULT_DATASET_URL;

    this.onErrorHandler = options.onErrorHandler || (() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    this.onSuccessHandler = options.onSuccessHandler || (() => {}); // eslint-disable-line @typescript-eslint/no-empty-function

    const [error, url] = createUrl(this.serverUrl, ENDPOINT_ADD_EVENTS);

    if (error || !url) {
      throw buildError('Could not build the URL', error);
    }

    this.url = url;

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

              if (status !== API_RESPONSE_STATUS.SUCCESS && status !== API_RESPONSE_STATUS.BAD_PARAM) {
                // logger.debug({ status, url: this.url }, `addEvent API request was not successful, retrying...`);
                return retryWithMergedOptions({});
              }

              // if (status === API_RESPONSE_STATUS.SUCCESS) {
              //   logger.debug({ url: this.url }, 'Successfully sent API request');
              // }

              return response;
            },
          ],
        },
      });

      const { status } = body;

      const isSuccess = status === API_RESPONSE_STATUS.SUCCESS;

      if (isSuccess) {
        this.onSuccessHandler(body);

        return true;
      } else {
        this.onErrorHandler(new Error(body.message));

        return false;
      }
    } catch (error) {
      if (error instanceof Error) {
        this.onErrorHandler(error);
      } else {
        this.onErrorHandler(new Error((error as string).toString()));
      }

      return false;
    }
  }
}
