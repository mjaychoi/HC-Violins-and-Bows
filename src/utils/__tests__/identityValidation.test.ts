import {
  getClientIdentityError,
  getInstrumentIdentityError,
  hasClientIdentity,
  hasInstrumentIdentity,
  INSTRUMENT_IDENTITY_ERROR,
} from '../identityValidation';

describe('identityValidation', () => {
  describe('hasInstrumentIdentity', () => {
    it('accepts maker only', () => {
      expect(hasInstrumentIdentity({ maker: 'Stradivari', type: null })).toBe(
        true
      );
    });

    it('accepts type only', () => {
      expect(hasInstrumentIdentity({ maker: null, type: 'Violin' })).toBe(true);
    });

    it('rejects whitespace-only values', () => {
      expect(hasInstrumentIdentity({ maker: '   ', type: '' })).toBe(false);
    });

    it('rejects both absent', () => {
      expect(hasInstrumentIdentity({ maker: null, type: null })).toBe(false);
      expect(getInstrumentIdentityError({ maker: null, type: null })).toBe(
        INSTRUMENT_IDENTITY_ERROR
      );
    });
  });

  describe('hasClientIdentity', () => {
    it('accepts first name only', () => {
      expect(hasClientIdentity({ first_name: 'Ada', last_name: null })).toBe(
        true
      );
    });

    it('accepts last name only', () => {
      expect(hasClientIdentity({ first_name: null, last_name: 'Lovelace' })).toBe(
        true
      );
    });

    it('rejects both blank', () => {
      expect(hasClientIdentity({ first_name: '', last_name: '   ' })).toBe(
        false
      );
      expect(getClientIdentityError({ first_name: '', last_name: '   ' })).toBe(
        'Client name is required'
      );
    });
  });
});
