export enum ADD_EVENT_API_STATUS {
  SUCCESS = 'success',
  BAD_PARAM = 'error/client/badParam',
}

// https://app.scalyr.com/help/api#addEvents
// the request body can be at most 6MB in length. Longer requests will be rejected.
// To avoid problems, if you have a large number of event records to upload, you should issue them
// in batches well below the 6MB limit.
// TODO: Improve logic on how to split events into batches to account for size rather than events length
export const MAX_EVENTS_PER_BATCH = 200;

export const ENDPOINT = '/api/addEvents';

export const DEFAULT_DATASET_URL = 'https://api.scalyr.com';
