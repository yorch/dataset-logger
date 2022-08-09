import got from 'got';
import { createUrl } from './create-url';

enum ADD_EVENT_API_STATUS {
  SUCCESS = 'success',
  BAD_PARAM = 'error/client/badParam',
}

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
  serverUrl?: string;
  sessionInfo?: DataSetSessionInfo;
  onErrorHandler?: (error: Error) => void;
  onSuccessHandler?: (response: unknown) => void;
};

// https://app.scalyr.com/help/api#addEvents
// the request body can be at most 6MB in length. Longer requests will be rejected.
// To avoid problems, if you have a large number of event records to upload, you should issue them
// in batches well below the 6MB limit.
// TODO: Improve logic on how to split events into batches to account for size rather than events length
const MAX_EVENTS_PER_BATCH = 200;

const ENDPOINT = '/api/addEvents';

export const DEFAULT_DATASET_URL = 'https://api.scalyr.com';

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

    this.sessionInfo = options.sessionInfo;

    this.serverUrl = options.serverUrl || DEFAULT_DATASET_URL;

    this.onErrorHandler = options.onErrorHandler || (() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    this.onSuccessHandler = options.onSuccessHandler || (() => {}); // eslint-disable-line @typescript-eslint/no-empty-function

    const [err, url] = createUrl(this.serverUrl, ENDPOINT);

    if (err || !url) {
      const errorMessage = ['Could not build the URL', err?.message].filter(Boolean).join('. ');

      throw new Error(errorMessage);
    }

    this.url = url;

    // Init sending events
    this.setTimeout();
  }

  log(event: Omit<DataSetEvent, 'ts'> & { ts?: DataSetEvent['ts'] }) {
    if (this.isClosed) {
      return;
    }

    this.queue.push({
      // If no timestamp is provided, use the current time
      ts: new Date().getTime() * 1_000_000, // To nanoseconds
      ...event,
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
        this.onSuccessHandler(body);

        return true;
      } else {
        this.onErrorHandler(new Error(body.message));

        return false;
      }
    } catch (error) {
      this.onErrorHandler(error as Error);

      return false;
    }
  }
}
