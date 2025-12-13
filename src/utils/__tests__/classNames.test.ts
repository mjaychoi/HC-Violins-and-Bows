import { classNames, cn } from '../classNames';

describe('classNames', () => {
  describe('classNames object', () => {
    it('should have all expected style properties', () => {
      expect(classNames.input).toBeDefined();
      expect(classNames.inputError).toBeDefined();
      expect(classNames.buttonPrimary).toBeDefined();
      expect(classNames.buttonSecondary).toBeDefined();
      expect(classNames.buttonDanger).toBeDefined();
      expect(classNames.card).toBeDefined();
      expect(classNames.cardHeader).toBeDefined();
      expect(classNames.formGroup).toBeDefined();
      expect(classNames.formLabel).toBeDefined();
      expect(classNames.formError).toBeDefined();
      expect(classNames.table).toBeDefined();
      expect(classNames.tableHeader).toBeDefined();
      expect(classNames.tableRow).toBeDefined();
      expect(classNames.tableCell).toBeDefined();
      expect(classNames.modalOverlay).toBeDefined();
      expect(classNames.modalWrapper).toBeDefined();
      expect(classNames.modalContent).toBeDefined();
      expect(classNames.modalHeader).toBeDefined();
      expect(classNames.modalBody).toBeDefined();
      expect(classNames.modalFooter).toBeDefined();
    });

    it('should return string values', () => {
      expect(typeof classNames.input).toBe('string');
      expect(typeof classNames.buttonPrimary).toBe('string');
      expect(typeof classNames.card).toBe('string');
    });
  });

  describe('cn function', () => {
    it('should merge class names', () => {
      const result = cn('class1', 'class2');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
    });

    it('should handle undefined and null values', () => {
      const result = cn('class1', undefined, null, 'class2');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).not.toContain('undefined');
      expect(result).not.toContain('null');
    });

    it('should handle boolean values', () => {
      const result = cn('class1', true && 'class2', false && 'class3');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).not.toContain('class3');
    });

    it('should handle object conditions', () => {
      const result = cn({
        class1: true,
        class2: false,
        class3: true,
      });
      expect(result).toContain('class1');
      expect(result).toContain('class3');
      expect(result).not.toContain('class2');
    });

    it('should merge Tailwind classes correctly', () => {
      const result = cn('p-4', 'p-6');
      // tailwind-merge should resolve to p-6 (last one wins)
      expect(result).toBe('p-6');
    });

    it('should handle mixed inputs', () => {
      const result = cn(
        'class1',
        undefined,
        { class2: true, class3: false },
        'class4'
      );
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class4');
      expect(result).not.toContain('class3');
    });
  });
});
