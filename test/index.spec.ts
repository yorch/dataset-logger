import { DataSetLogger } from '../src';

describe('index', () => {
  describe('DataSetLogger', () => {
    it('should instantiate the logger', async () => {
      const logger = new DataSetLogger({
        apiKey: '1234',
      });

      expect(typeof logger.log).toEqual('function');

      await logger.close();
    });
  });
});
