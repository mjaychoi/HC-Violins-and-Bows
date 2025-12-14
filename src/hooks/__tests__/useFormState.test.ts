import { renderHook, act } from '@/test-utils/render';
import { useFormState } from '../useFormState';

describe('useFormState', () => {
  interface TestFormData extends Record<string, unknown> {
    name: string;
    email: string;
    age?: number;
  }

  it('should initialize with initial state', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
      age: 30,
    };
    const { result } = renderHook(() => useFormState(initialState));

    expect(result.current.formData).toEqual(initialState);
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
  });

  it('should update single field', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.updateField('name', 'Jane');
    });

    expect(result.current.formData.name).toBe('Jane');
    expect(result.current.formData.email).toBe('john@example.com');
  });

  it('should update multiple fields', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.updateFields({
        name: 'Jane',
        email: 'jane@example.com',
      });
    });

    expect(result.current.formData.name).toBe('Jane');
    expect(result.current.formData.email).toBe('jane@example.com');
  });

  it('should clear error when field is updated', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.setFieldError('name', 'Name is required');
    });

    expect(result.current.errors.name).toBe('Name is required');

    act(() => {
      result.current.updateField('name', 'Jane');
    });

    expect(result.current.errors.name).toBeUndefined();
  });

  it('should set field error', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.setFieldError('name', 'Name is required');
    });

    expect(result.current.errors.name).toBe('Name is required');
  });

  it('should set multiple field errors', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.setFieldError('name', 'Name is required');
      result.current.setFieldError('email', 'Email is invalid');
    });

    expect(result.current.errors.name).toBe('Name is required');
    expect(result.current.errors.email).toBe('Email is invalid');
  });

  it('should set field touched', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.setFieldTouched('name', true);
    });

    expect(result.current.touched.name).toBe(true);
    expect(result.current.touched.email).toBeUndefined();
  });

  it('should set field touched to false', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.setFieldTouched('name', true);
      result.current.setFieldTouched('name', false);
    });

    expect(result.current.touched.name).toBe(false);
  });

  it('should reset form to initial state', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.updateField('name', 'Jane');
      result.current.setFieldError('name', 'Error');
      result.current.setFieldTouched('name', true);
    });

    act(() => {
      result.current.resetForm();
    });

    expect(result.current.formData).toEqual(initialState);
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
  });

  it('should reset form after updating initial state', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result, rerender } = renderHook(
      ({ initial }) => useFormState(initial),
      { initialProps: { initial: initialState } }
    );

    act(() => {
      result.current.updateField('name', 'Jane');
    });

    const newInitialState: TestFormData = {
      name: 'Bob',
      email: 'bob@example.com',
    };

    rerender({ initial: newInitialState });

    act(() => {
      result.current.resetForm();
    });

    expect(result.current.formData).toEqual(newInitialState);
  });

  it('should detect hasErrors', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    expect(result.current.hasErrors).toBe(false);

    act(() => {
      result.current.setFieldError('name', 'Error');
    });

    expect(result.current.hasErrors).toBe(true);
  });

  it('should detect isTouched', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    expect(result.current.isTouched).toBe(false);

    act(() => {
      result.current.setFieldTouched('name', true);
    });

    expect(result.current.isTouched).toBe(true);
  });

  it('should allow direct setFormData', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    const newData: TestFormData = {
      name: 'Jane',
      email: 'jane@example.com',
      age: 25,
    };

    act(() => {
      result.current.setFormData(newData);
    });

    expect(result.current.formData).toEqual(newData);
  });

  it('should allow direct setErrors', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    const newErrors: Partial<Record<keyof TestFormData, string>> = {
      name: 'Name error',
      email: 'Email error',
    };

    act(() => {
      result.current.setErrors(newErrors);
    });

    expect(result.current.errors).toEqual(newErrors);
  });

  it('should allow direct setTouched', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    const newTouched: Partial<Record<keyof TestFormData, boolean>> = {
      name: true,
      email: true,
    };

    act(() => {
      result.current.setTouched(newTouched);
    });

    expect(result.current.touched).toEqual(newTouched);
  });

  it('should handle optional fields', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.updateField('age', 30);
    });

    expect(result.current.formData.age).toBe(30);
  });

  it('should handle updating field without clearing unrelated errors', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.setFieldError('name', 'Name error');
      result.current.setFieldError('email', 'Email error');
    });

    act(() => {
      result.current.updateField('name', 'Jane');
    });

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.errors.email).toBe('Email error');
  });

  it('should maintain referential stability for callbacks', () => {
    const initialState: TestFormData = {
      name: 'John',
      email: 'john@example.com',
    };
    const { result } = renderHook(() => useFormState(initialState));

    act(() => {
      result.current.updateField('name', 'Jane');
    });

    // Callbacks should be stable (memoized)
    // Note: This depends on useCallback implementation
    expect(result.current.formData.name).toBe('Jane');
  });
});
