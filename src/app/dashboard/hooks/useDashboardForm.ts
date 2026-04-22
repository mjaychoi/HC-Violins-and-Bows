import { useState } from 'react';
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
    cost_price: '',
    consignment_price: '',
    ownership: '',
    note: '',
    serial_number: '',
  };

  const { formData, updateField, updateFields, resetForm } =
    useFormState(initialFormData);

  // FIXED: priceInput is the single source of truth for price input
  // formData.price is derived at submit time, not stored separately
  // This avoids the drift issue where formData.price and priceInput can get out of sync
  const [priceInput, setPriceInput] = useState('');
  const [costPriceInput, setCostPriceInput] = useState('');
  const [consignmentPriceInput, setConsignmentPriceInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handlePriceChange = (value: string) => {
    setPriceInput(value);
    // Don't update formData.price - it will be derived at submit time
  };

  const handleCostPriceChange = (value: string) => {
    setCostPriceInput(value);
  };

  const handleConsignmentPriceChange = (value: string) => {
    setConsignmentPriceInput(value);
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
    setCostPriceInput('');
    setConsignmentPriceInput('');
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
    costPriceInput,
    setCostPriceInput,
    handleCostPriceChange,
    consignmentPriceInput,
    setConsignmentPriceInput,
    handleConsignmentPriceChange,
    selectedFiles,
    setSelectedFiles,
    handleFileChange,
    removeFile,
  };
}
