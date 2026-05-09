'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Instrument, InstrumentImage } from '@/types';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import OptimizedImage from '@/components/common/OptimizedImage';
import {
  formatInstrumentPrice,
  formatInstrumentYear,
  formatFileSize,
} from '../utils/dashboardUtils';
import { apiFetch } from '@/utils/apiFetch';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePermissions } from '@/hooks/usePermissions';
import {
  handleApiResponse,
  readApiResponseBody,
} from '@/utils/handleApiResponse';

interface InstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrument: Instrument | null;
}

type MediaLoadState = 'loading' | 'success' | 'empty' | 'error';
type CertificateFile = {
  id?: string;
  name: string;
  path: string;
  size: number;
  createdAt: string | null;
};

function getCertificateDisplayName(file: CertificateFile): string {
  return file.name.replace(/^\d+_/, '');
}

function getCertificateStorageFileName(file: CertificateFile): string {
  const pathParts = file.path.split('/').filter(Boolean);
  return pathParts[pathParts.length - 1] || file.name;
}

function getCertificateKey(file: CertificateFile): string {
  return file.id || file.path || file.name;
}

export default function InstrumentModal({
  isOpen,
  onClose,
  instrument,
}: InstrumentModalProps) {
  const { canUploadInstrumentMedia } = usePermissions();
  const modalRef = useRef<HTMLDivElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const certificateFileInputRef = useRef<HTMLInputElement>(null);
  const replaceCertificateFileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<InstrumentImage[]>([]);
  const [certificates, setCertificates] = useState<CertificateFile[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingCertificates, setLoadingCertificates] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [deletingCertificateKey, setDeletingCertificateKey] = useState<
    string | null
  >(null);
  const [replacingCertificateKey, setReplacingCertificateKey] = useState<
    string | null
  >(null);
  const [certificateToReplace, setCertificateToReplace] =
    useState<CertificateFile | null>(null);
  const [imageState, setImageState] = useState<MediaLoadState>('loading');
  const [certificateState, setCertificateState] =
    useState<MediaLoadState>('loading');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const { showSuccess, showWarning, handleError } = useAppFeedback();

  // Request ID counters to handle concurrent requests
  const imageReqIdRef = useRef(0);
  const certificateReqIdRef = useRef(0);

  useOutsideClose(modalRef, {
    isOpen,
    onClose,
  });

  const fetchImages = useCallback(
    async (instrumentId: string) => {
      const reqId = ++imageReqIdRef.current;
      setLoadingImages(true);
      setImageState('loading');
      try {
        const response = await apiFetch(
          `/api/instruments/${instrumentId}/images`
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch images: ${response.statusText}`);
        }

        if (imageReqIdRef.current === reqId) {
          const data = await handleApiResponse<InstrumentImage[]>(
            response,
            'Failed to fetch images'
          );
          const sortedImages = (data || []).sort(
            (a: InstrumentImage, b: InstrumentImage) =>
              a.display_order - b.display_order
          );
          setImages(sortedImages);
          setSelectedImageIndex(0);
          setImageState(sortedImages.length > 0 ? 'success' : 'empty');
        }
      } catch (error) {
        if (imageReqIdRef.current === reqId) {
          setImages([]);
          setSelectedImageIndex(0);
          setImageState('error');
          handleError(error, 'InstrumentImagesFetch');
        }
      } finally {
        if (imageReqIdRef.current === reqId) {
          setLoadingImages(false);
        }
      }
    },
    [handleError]
  );

  const fetchCertificates = useCallback(
    async (instrumentId: string) => {
      const reqId = ++certificateReqIdRef.current;
      setLoadingCertificates(true);
      setCertificateState('loading');
      try {
        const response = await apiFetch(
          `/api/instruments/${instrumentId}/certificates`
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch certificates: ${response.statusText}`
          );
        }

        if (certificateReqIdRef.current === reqId) {
          const files = await handleApiResponse<CertificateFile[]>(
            response,
            'Failed to fetch certificates'
          );
          setCertificates(files || []);
          setCertificateState(files.length > 0 ? 'success' : 'empty');
        }
      } catch (error) {
        if (certificateReqIdRef.current === reqId) {
          setCertificates([]);
          setCertificateState('error');
          handleError(error, 'InstrumentCertificatesFetch');
        }
      } finally {
        if (certificateReqIdRef.current === reqId) {
          setLoadingCertificates(false);
        }
      }
    },
    [handleError]
  );

  // Fetch media when modal opens
  useEffect(() => {
    if (isOpen && instrument?.id) {
      setSelectedImageIndex(0);
      fetchImages(instrument.id);
      fetchCertificates(instrument.id);
    } else {
      setImages([]);
      setCertificates([]);
      setCertificateToReplace(null);
      setDeletingCertificateKey(null);
      setReplacingCertificateKey(null);
      setImageState('empty');
      setCertificateState('empty');
      setSelectedImageIndex(0);
    }
  }, [fetchCertificates, fetchImages, isOpen, instrument?.id]);

  const handleImageFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !instrument?.id || !canUploadInstrumentMedia) {
      return;
    }

    setUploadingImages(true);
    try {
      const fd = new FormData();
      files.forEach(file => fd.append('images', file));
      const response = await apiFetch(
        `/api/instruments/${instrument.id}/images`,
        { method: 'POST', body: fd }
      );
      const uploaded = await handleApiResponse<InstrumentImage[]>(
        response,
        'Failed to upload images'
      );
      showSuccess(
        uploaded.length === 1
          ? 'Image uploaded successfully.'
          : `${uploaded.length} images uploaded successfully.`
      );
      await fetchImages(instrument.id);
    } catch (error) {
      handleError(error, 'InstrumentImageUpload');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleCertificateFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !instrument?.id || !canUploadInstrumentMedia) {
      return;
    }

    setUploadingCertificate(true);
    try {
      const fd = new FormData();
      fd.append('certificate', file);
      const response = await apiFetch(
        `/api/instruments/${instrument.id}/certificates`,
        { method: 'POST', body: fd }
      );
      const body = await readApiResponseBody<{ message?: string }>(
        response,
        'Failed to upload certificate'
      );
      showSuccess(body.message || 'Certificate uploaded successfully.');
      await fetchCertificates(instrument.id);
    } catch (error) {
      handleError(error, 'InstrumentCertificateUpload');
    } finally {
      setUploadingCertificate(false);
    }
  };

  const handleCertificateDelete = async (file: CertificateFile) => {
    if (!instrument?.id || !canUploadInstrumentMedia) {
      return;
    }

    const fileKey = getCertificateKey(file);
    const deleteParam = file.id
      ? `id=${encodeURIComponent(file.id)}`
      : `file=${encodeURIComponent(getCertificateStorageFileName(file))}`;

    setDeletingCertificateKey(fileKey);
    try {
      const response = await apiFetch(
        `/api/instruments/${instrument.id}/certificates?${deleteParam}`,
        { method: 'DELETE' }
      );
      const body = await readApiResponseBody<{
        result?: { partial_success?: boolean };
        message?: string;
      }>(response, 'Failed to delete certificate');

      if (body.result?.partial_success) {
        showWarning(
          body.message ||
            'Certificate metadata was deleted, but storage cleanup needs attention.'
        );
      } else {
        showSuccess(body.message || 'Certificate deleted successfully.');
      }

      await fetchCertificates(instrument.id);
    } catch (error) {
      handleError(error, 'InstrumentCertificateDelete');
    } finally {
      setDeletingCertificateKey(null);
    }
  };

  const handleReplaceCertificateClick = (file: CertificateFile) => {
    setCertificateToReplace(file);
    replaceCertificateFileInputRef.current?.click();
  };

  const handleReplaceCertificateFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (
      !file ||
      !instrument?.id ||
      !canUploadInstrumentMedia ||
      !certificateToReplace
    ) {
      setCertificateToReplace(null);
      return;
    }

    const fileKey = getCertificateKey(certificateToReplace);
    setReplacingCertificateKey(fileKey);
    try {
      const fd = new FormData();
      fd.append('certificate', file);
      const response = await apiFetch(
        `/api/instruments/${instrument.id}/certificates?file=${encodeURIComponent(
          getCertificateStorageFileName(certificateToReplace)
        )}`,
        { method: 'PUT', body: fd }
      );
      const body = await readApiResponseBody<{ message?: string }>(
        response,
        'Failed to replace certificate'
      );
      showSuccess(body.message || 'Certificate replaced successfully.');
      await fetchCertificates(instrument.id);
    } catch (error) {
      handleError(error, 'InstrumentCertificateReplace');
    } finally {
      setReplacingCertificateKey(null);
      setCertificateToReplace(null);
    }
  };

  const handlePrevImage = () => {
    setSelectedImageIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNextImage = () => {
    setSelectedImageIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
  };

  if (!isOpen || !instrument) return null;

  const selectedImage = images[selectedImageIndex];
  const hasImageContent = imageState === 'success' && images.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="instrument-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3
              id="instrument-modal-title"
              className="text-lg font-medium text-gray-900"
            >
              Instrument Details
            </h3>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Images */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Images</h4>

              {loadingImages ? (
                <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
                  <div className="text-gray-500">Loading images...</div>
                </div>
              ) : imageState === 'error' ? (
                <div className="flex flex-col items-center justify-center gap-3 h-64 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-red-700 text-sm">
                    Failed to load media
                  </div>
                  <button
                    type="button"
                    onClick={() => instrument?.id && fetchImages(instrument.id)}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-md hover:bg-red-100"
                  >
                    Retry
                  </button>
                </div>
              ) : hasImageContent ? (
                <>
                  {/* Main Image */}
                  <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                    {selectedImage && (
                      <>
                        <OptimizedImage
                          src={selectedImage.image_url}
                          alt={
                            selectedImage.alt_text ||
                            `Instrument image ${selectedImageIndex + 1}`
                          }
                          fill
                          objectFit="contain"
                          className="rounded-lg"
                        />
                        {/* Navigation Arrows */}
                        {images.length > 1 && (
                          <>
                            <button
                              onClick={handlePrevImage}
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity"
                              aria-label="Previous image"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 19l-7-7 7-7"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={handleNextImage}
                              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity"
                              aria-label="Next image"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                        {/* Image Counter */}
                        {images.length > 1 && (
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
                            {selectedImageIndex + 1} / {images.length}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Thumbnail Grid */}
                  {images.length > 1 && (
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((img, index) => (
                        <button
                          key={img.id}
                          onClick={() => setSelectedImageIndex(index)}
                          className={`relative w-full h-20 bg-gray-100 rounded-lg overflow-hidden border-2 transition-all ${
                            index === selectedImageIndex
                              ? 'border-blue-500 ring-2 ring-blue-200'
                              : 'border-transparent hover:border-gray-300'
                          }`}
                          aria-label={`View image ${index + 1}`}
                        >
                          <OptimizedImage
                            src={img.image_url}
                            alt={img.alt_text || `Thumbnail ${index + 1}`}
                            fill
                            objectFit="cover"
                            className="rounded-lg"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
                  <div className="text-gray-500 text-sm">
                    No images available
                  </div>
                </div>
              )}

              {canUploadInstrumentMedia ? (
                <div className="pt-4 border-t border-gray-200">
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    aria-label="Upload instrument images"
                    onChange={handleImageFileChange}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => imageFileInputRef.current?.click()}
                      disabled={uploadingImages || loadingImages}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadingImages ? 'Uploading...' : 'Upload Images'}
                    </button>
                    <span className="text-xs text-gray-500">
                      JPG, PNG, or WebP. You can select multiple files.
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Certificates
                </h4>
                {loadingCertificates ? (
                  <div className="text-sm text-gray-500">
                    Loading certificates...
                  </div>
                ) : certificateState === 'error' ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-xs text-red-700">Failed to load media</p>
                    <button
                      type="button"
                      onClick={() =>
                        instrument?.id && fetchCertificates(instrument.id)
                      }
                      className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-md hover:bg-red-100"
                    >
                      Retry
                    </button>
                  </div>
                ) : certificates.length > 0 ? (
                  <div className="space-y-2">
                    {certificates.map(file => (
                      <div
                        key={getCertificateKey(file)}
                        className="rounded-lg border border-gray-200 p-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-gray-900">
                              {getCertificateDisplayName(file)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {file.createdAt
                                ? new Date(file.createdAt).toLocaleDateString()
                                : null}
                              {file.size > 0 ? (
                                <span>
                                  {file.createdAt ? ' · ' : ''}
                                  {formatFileSize(file.size)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {canUploadInstrumentMedia ? (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleReplaceCertificateClick(file)
                                }
                                disabled={
                                  replacingCertificateKey ===
                                    getCertificateKey(file) ||
                                  deletingCertificateKey ===
                                    getCertificateKey(file) ||
                                  loadingCertificates
                                }
                                className="px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Replace certificate ${getCertificateDisplayName(
                                  file
                                )}`}
                              >
                                {replacingCertificateKey ===
                                getCertificateKey(file)
                                  ? 'Replacing...'
                                  : 'Replace'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCertificateDelete(file)}
                                disabled={
                                  deletingCertificateKey ===
                                    getCertificateKey(file) ||
                                  replacingCertificateKey ===
                                    getCertificateKey(file) ||
                                  loadingCertificates
                                }
                                className="px-2 py-1 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Delete certificate ${getCertificateDisplayName(
                                  file
                                )}`}
                              >
                                {deletingCertificateKey ===
                                getCertificateKey(file)
                                  ? 'Deleting...'
                                  : 'Delete'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    No certificate files uploaded yet.
                  </p>
                )}

                {canUploadInstrumentMedia ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      ref={certificateFileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      aria-label="Upload certificate PDF"
                      onChange={handleCertificateFileChange}
                    />
                    <input
                      ref={replaceCertificateFileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      aria-label="Replace certificate PDF"
                      onChange={handleReplaceCertificateFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => certificateFileInputRef.current?.click()}
                      disabled={uploadingCertificate || loadingCertificates}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadingCertificate ? 'Uploading...' : 'Upload PDF'}
                    </button>
                    <span className="text-xs text-gray-500">
                      PDF only, max 100MB
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Right Column - Details */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Details</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    Serial Number
                  </div>
                  <div className="font-mono text-sm text-gray-900">
                    {instrument.serial_number || '—'}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">Status</div>
                  <div className="text-sm font-medium text-gray-900">
                    {instrument.status}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">Maker</div>
                  <div className="text-sm text-gray-900">
                    {instrument.maker || '—'}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">Type</div>
                  <div className="text-sm text-gray-900">
                    {instrument.type || '—'}
                    {instrument.subtype && ` (${instrument.subtype})`}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">Year</div>
                  <div className="text-sm text-gray-900">
                    {formatInstrumentYear(instrument.year)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">Price</div>
                  <div className="text-sm font-medium text-gray-900">
                    {formatInstrumentPrice(instrument.price)}
                  </div>
                </div>

                {instrument.size && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Size</div>
                    <div className="text-sm text-gray-900">
                      {instrument.size}
                    </div>
                  </div>
                )}

                {instrument.weight && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Weight</div>
                    <div className="text-sm text-gray-900">
                      {instrument.weight}
                    </div>
                  </div>
                )}

                {instrument.note && (
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Note</div>
                    <div className="text-sm text-gray-900 whitespace-pre-wrap">
                      {instrument.note}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
