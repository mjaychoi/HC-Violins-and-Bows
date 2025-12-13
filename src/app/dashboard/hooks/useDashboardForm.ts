import { useState, useEffect } from 'react';
// import { Item } from '@/types'
import { useFormState } from '@/hooks/useFormState';

export function useDashboardForm() {
  const initialFormData = {
    status: 'Available',
    maker: '',
    type: 'Instrument',
    subtype: 'Violin',
    year: '',
    certificate: false,
    size: '',
    weight: '',
    price: '',
    ownership: '',
    note: '',
    serial_number: '',
  };

  const { formData, updateField, updateFields, resetForm } =
    useFormState(initialFormData);

  const [priceInput, setPriceInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // FIXED: Handle price.toString() safely - normalize null/undefined/0 to empty string
  useEffect(() => {
    setPriceInput(formData.price ? String(formData.price) : '');
  }, [formData.price]);

  const handlePriceChange = (value: string) => {
    setPriceInput(value);
    updateField('price', value);
  };

  const handleFileChange = (files: FileList | null) => {
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const resetFormData = () => {
    resetForm();
    setPriceInput('');
    setSelectedFiles([]);
  };

  return {
    formData,
    updateField,
    updateFields,
    resetForm: resetFormData,
    priceInput,
    setPriceInput,
    handlePriceChange,
    selectedFiles,
    setSelectedFiles,
    handleFileChange,
    removeFile,
  };
}
