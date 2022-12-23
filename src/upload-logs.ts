import got, { Headers, Hooks, RequiredRetryOptions } from 'got/dist/source';
import fs from 'fs';
import stream from 'stream';
import { promisify } from 'util';
import { API_RESPONSE_STATUS, DEFAULT_DATASET_URL, ENDPOINT_UPLOAD_LOGS } from './constants';
import { DataSetSessionInfo } from './types';
import { buildError, convertSessionInfoToHeaders, createUrl } from './utils';

/**
 * Uploads unstructured, plain-text logs. Used for lightweight integrations, and to upload
 * batches of data from a stateless environment.
 *
 * More documentation at https://app.scalyr.com/help/api-uploadLogs
 */
export const uploadLogs = async ({
  apiKey,
  body,
  filePath,
  logfile,
  parser,
  serverUrl,
  sessionInfo,
}: {
  apiKey: string;
  body?: string;
  filePath?: string;
  logfile?: string;
  parser?: string;
  serverUrl?: string;
  sessionInfo?: DataSetSessionInfo;
}) => {
  if (!apiKey) {
    throw new Error('apiKey is required');
  }

  const [error, url] = createUrl(serverUrl || DEFAULT_DATASET_URL, ENDPOINT_UPLOAD_LOGS);

  if (error) {
    throw buildError('Could not build the URL', error);
  }

  const headers: Headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'text/plain',
    ...(logfile ? { logfile } : {}),
    ...(parser ? { parser } : {}),
    ...convertSessionInfoToHeaders(sessionInfo),
  };

  const retry: Partial<RequiredRetryOptions> = {
    limit: 5,
    methods: ['POST'],
  };

  const hooks: Hooks = {
    afterResponse: [
      (response, retryWithMergedOptions) => {
        // @ts-expect-error TODO: Fix response body type
        const { status } = response.body;

        if (status !== API_RESPONSE_STATUS.SUCCESS && status !== API_RESPONSE_STATUS.BAD_PARAM) {
          return retryWithMergedOptions({});
        }

        return response;
      },
    ],
  };

  if (body) {
    const {
      statusCode,
      statusMessage,
      body: { message, status } = {},
    } = await got.post<{ message?: string; status: string }>(url, {
      body,
      headers,
      retry,
      responseType: 'json',
      hooks,
    });

    return { message, status, statusCode, statusMessage };
  } else if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File ${filePath} does not exist`);
    }

    const pipeline = promisify(stream.pipeline);

    await pipeline(fs.createReadStream(filePath), got.stream.post(url, { headers, retry, hooks }));
  }
};
