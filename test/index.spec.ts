import { DataSetLogger } from '../src';

describe('index', () => {
  describe('DataSetLogger', () => {
    it('should instantiate the logger', () => {
      const result = new DataSetLogger({
        apiKey: '1234',
      });

      expect(typeof result.log).toEqual('function');
    });
  });
});
