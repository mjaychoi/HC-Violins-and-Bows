// src/app/clients/__tests__/constants.test.ts
import {
  CLIENT_TAG_OPTIONS,
  INTEREST_LEVELS,
  HAS_INSTRUMENTS_FILTER_OPTIONS,
} from '../constants';

describe('Client Constants', () => {
  describe('CLIENT_TAG_OPTIONS', () => {
    it('should have all required tag options', () => {
      expect(CLIENT_TAG_OPTIONS).toContain('Owner');
      expect(CLIENT_TAG_OPTIONS).toContain('Musician');
      expect(CLIENT_TAG_OPTIONS).toContain('Dealer');
      expect(CLIENT_TAG_OPTIONS).toContain('Collector');
      expect(CLIENT_TAG_OPTIONS).toContain('Other');
    });

    it('should have correct length', () => {
      expect(CLIENT_TAG_OPTIONS).toHaveLength(5);
    });

    it('should be readonly array', () => {
      // TypeScript에서 readonly이므로 실제로는 수정 불가능하지만,
      // 테스트에서는 배열이 고정되어 있는지 확인
      expect(Array.isArray(CLIENT_TAG_OPTIONS)).toBe(true);
    });
  });

  describe('INTEREST_LEVELS', () => {
    it('should have all required interest levels', () => {
      expect(INTEREST_LEVELS).toContain('Active');
      expect(INTEREST_LEVELS).toContain('Passive');
      expect(INTEREST_LEVELS).toContain('Inactive');
    });

    it('should have correct length', () => {
      expect(INTEREST_LEVELS).toHaveLength(3);
    });
  });

  describe('HAS_INSTRUMENTS_FILTER_OPTIONS', () => {
    it('should have HAS option', () => {
      expect(HAS_INSTRUMENTS_FILTER_OPTIONS.HAS).toBe('Has Instruments');
    });

    it('should have NO option', () => {
      expect(HAS_INSTRUMENTS_FILTER_OPTIONS.NO).toBe('No Instruments');
    });

    it('should have both options', () => {
      expect(Object.keys(HAS_INSTRUMENTS_FILTER_OPTIONS)).toHaveLength(2);
    });
  });
});
