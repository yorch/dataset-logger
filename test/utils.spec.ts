import { DataSetSessionInfo } from '../src';
import { convertSessionInfoToHeaders } from '../src/utils';

describe('utils', () => {
  describe('convertSessionInfoToHeaders', () => {
    test('should convert object successfully', () => {
      const sessionInfo: DataSetSessionInfo = {
        serverHost: 'host1',
        attribute1: 'value 1',
        attribute2: 1234,
        attribute3: new Date(1671765817530),
        serverRegion: 'us-east',
      };

      expect(convertSessionInfoToHeaders(sessionInfo)).toEqual({
        'server-host': 'host1',
        'server-attribute1': 'value 1',
        'server-attribute2': '1234',
        'server-attribute3': '1671765817530',
        'server-region': 'us-east',
      });
    });
  });
});
