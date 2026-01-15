'use client';

import { useState, useEffect, useRef } from 'react';
import { Instrument, InstrumentImage, ClientInstrument, Client } from '@/types';
import OptimizedImage from '@/components/common/OptimizedImage';
import {
  formatInstrumentPrice,
  formatInstrumentYear,
  formatFileSize,
  formatClientName,
} from '../utils/dashboardUtils';
import { apiFetch } from '@/utils/apiFetch';
import { cn } from '@/utils/classNames';
import { useSuccessToastContext } from '@/contexts/SuccessToastContext';
import { useErrorContext } from '@/contexts/ErrorContext';
import Link from 'next/link';

interface InstrumentExpandedRowProps {
  instrument: Instrument;
  clients?: ClientInstrument[];
  ownerLabel?: string;
  ownerClient?: Client | null;
}

interface CertificateFile {
  id?: string;
  name: string;
  path: string;
  size: number;
  createdAt: string | null;
}

const CERTIFICATE_CACHE_TTL = 60 * 1000; // 1 minute
const certificateCache = new Map<
  string,
  { data: CertificateFile[]; updatedAt: number }
>();

export function __resetCertificateCacheForTests() {
  certificateCache.clear();
}

export function InstrumentExpandedRow({
  instrument,
  clients = [],
  ownerLabel,
  ownerClient,
}: InstrumentExpandedRowProps) {
  const [images, setImages] = useState<InstrumentImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [certificateFiles, setCertificateFiles] = useState<CertificateFile[]>(
    []
  );
  const [loadingCertificates, setLoadingCertificates] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{
    id?: string;
    fileName: string;
  } | null>(null);
  const { showSuccess } = useSuccessToastContext();
  const { handleError } = useErrorContext();
  const hasCertificateFile = certificateFiles.length > 0;

  // Request ID counters to handle concurrent requests
  const imageReqIdRef = useRef(0);
  const certificateReqIdRef = useRef(0);

  // Fetch images and certificates when component mounts or instrument changes
  useEffect(() => {
    let alive = true;
    const currentInstrumentId = instrument?.id;

    if (!currentInstrumentId) {
      setImages([]);
      setSelectedImageIndex(0);
      setCertificateFiles([]);
      return;
    }

    setSelectedImageIndex(0);

    const isStillValid = () => alive && instrument?.id === currentInstrumentId;

    // Fetch images and certificates in parallel
    fetchImages(currentInstrumentId, isStillValid);
    fetchCertificates(currentInstrumentId, isStillValid);

    return () => {
      alive = false;
    };
  }, [instrument?.id]);

  const fetchImages = async (
    instrumentId: string,
    isStillValid?: () => boolean
  ) => {
    const reqId = ++imageReqIdRef.current;
    setLoadingImages(true);
    try {
      const response = await apiFetch(
        `/api/instruments/${instrumentId}/images`
      );
      if (!isStillValid || isStillValid()) {
        if (response.ok && imageReqIdRef.current === reqId) {
          const result = await response.json();
          const sortedImages = (result.data || []).sort(
            (a: InstrumentImage, b: InstrumentImage) =>
              a.display_order - b.display_order
          );
          setImages(sortedImages);
          setSelectedImageIndex(0);
        }
      }
    } catch (error) {
      if (isStillValid && !isStillValid()) return;
      console.error('Failed to fetch images:', error);
    } finally {
      if (imageReqIdRef.current === reqId) {
        setLoadingImages(false);
      }
    }
  };

  const fetchCertificates = async (
    instrumentId: string,
    isStillValid?: () => boolean,
    forceRefresh = false
  ) => {
    const reqId = ++certificateReqIdRef.current;
    setLoadingCertificates(true);
    try {
      const cached = certificateCache.get(instrumentId);
      if (
        !forceRefresh &&
        cached &&
        Date.now() - cached.updatedAt < CERTIFICATE_CACHE_TTL
      ) {
        if (!isStillValid || isStillValid()) {
          setCertificateFiles(cached.data);
        }
        return;
      }

      const response = await apiFetch(
        `/api/instruments/${instrumentId}/certificates`
      );
      if (!isStillValid || isStillValid()) {
        if (response.ok && certificateReqIdRef.current === reqId) {
          const result = await response.json();
          setCertificateFiles(result.data || []);
          certificateCache.set(instrumentId, {
            data: result.data || [],
            updatedAt: Date.now(),
          });
        }
      }
    } catch (error) {
      if (isStillValid && !isStillValid()) return;
      console.error('Failed to fetch certificates:', error);
    } finally {
      if (certificateReqIdRef.current === reqId) {
        setLoadingCertificates(false);
      }
    }
  };

  const handleDownloadCertificate = async (file: CertificateFile) => {
    if (!instrument?.id) return;
    if (!file?.name && !file?.id) {
      handleError(
        new Error('No certificate file selected'),
        'CertificateDownload'
      );
      return;
    }
    setDownloadingFile(file.name);
    try {
      const query = file.id
        ? `id=${encodeURIComponent(file.id)}`
        : `file=${encodeURIComponent(file.name)}`;
      const response = await apiFetch(
        `/api/instruments/${instrument.id}/certificate?${query}`
      );

      if (!response.ok) {
        handleError(
          new Error(`Failed to download certificate: ${response.statusText}`),
          'CertificateDownload'
        );
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safe =
        instrument.serial_number?.replace(/[^a-zA-Z0-9]/g, '_') ||
        instrument.id.slice(0, 8);
      const downloadFileName = file.name.replace(/^\d+_/, '');
      a.download = safe ? `${safe}_${downloadFileName}` : downloadFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showSuccess('Certificate downloaded successfully');
    } catch (error) {
      handleError(error, 'CertificateDownload');
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleDeleteCertificate = async (file: CertificateFile) => {
    if (!instrument?.id) return;
    setDeletingFile(file.name);
    try {
      const query = file.id
        ? `id=${encodeURIComponent(file.id)}`
        : `file=${encodeURIComponent(file.name)}`;
      const response = await apiFetch(
        `/api/instruments/${instrument.id}/certificates?${query}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        handleError(
          new Error(error.error || 'Failed to delete certificate'),
          'CertificateDelete'
        );
        return;
      }

      showSuccess('Certificate deleted successfully');
      // Refresh certificate list
      certificateCache.delete(instrument.id);
      await fetchCertificates(instrument.id, () => true, true);
      setShowDeleteConfirm(null);
    } catch (error) {
      handleError(error, 'CertificateDelete');
    } finally {
      setDeletingFile(null);
    }
  };

  const handlePrevImage = () => {
    setSelectedImageIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNextImage = () => {
    setSelectedImageIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const selectedImage = images[selectedImageIndex];

  // Count columns in ItemList table: empty header + 9 data columns = 10
  // Adjust if ItemList structure changes
  const colSpan = 10;

  return (
    <tr className="bg-gray-50">
      <td colSpan={colSpan} className="px-6 py-4 text-sm text-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Images */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Images</h4>

            {loadingImages ? (
              <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
                <div className="text-gray-500">Loading images...</div>
              </div>
            ) : images.length > 0 ? (
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
                        className={cn(
                          'relative w-full h-20 bg-gray-100 rounded-lg overflow-hidden border-2 transition-all',
                          index === selectedImageIndex
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-transparent hover:border-gray-300'
                        )}
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
                <div className="text-gray-500 text-sm">No images available</div>
              </div>
            )}

            {/* Certificate Section - Always show */}
            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Certificate{certificateFiles.length > 1 ? 's' : ''}
              </h4>
              {loadingCertificates ? (
                <div className="space-y-2">
                  {[1, 2].map(i => (
                    <div
                      key={i}
                      className="animate-pulse flex items-center justify-between p-2 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <div className="h-5 w-5 bg-gray-300 rounded"></div>
                        <div className="flex-1">
                          <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      </div>
                      <div className="h-8 w-20 bg-gray-300 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : certificateFiles.length > 0 ? (
                <div className="space-y-2">
                  {certificateFiles.map(file => {
                    const isDownloading = downloadingFile === file.name;
                    const isDeleting = deletingFile === file.name;
                    const displayName = file.name.replace(/^\d+_/, '');
                    const downloadLabel = `Download certificate ${displayName}`;
                    const deleteLabel = `Delete certificate ${displayName}`;
                    return (
                      <div
                        key={file.name}
                        className="flex items-center justify-between p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <svg
                              className="h-5 w-5 text-red-600 shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                              />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-700 truncate">
                                {file.name.replace(/^\d+_/, '')}
                              </div>
                              <div className="text-xs text-gray-500">
                                {file.createdAt && (
                                  <span>
                                    {new Date(
                                      file.createdAt
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                                {file.size > 0 && (
                                  <span className={file.createdAt ? ' · ' : ''}>
                                    {formatFileSize(file.size)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="ml-3 flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleDownloadCertificate(file)}
                            aria-label={downloadLabel}
                            disabled={isDownloading || isDeleting}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {isDownloading ? (
                              <>
                                <svg
                                  className="animate-spin h-3 w-3"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                Downloading
                              </>
                            ) : (
                              'Download'
                            )}
                          </button>
                          <button
                            onClick={() =>
                              setShowDeleteConfirm({
                                id: file.id,
                                fileName: file.name,
                              })
                            }
                            aria-label={deleteLabel}
                            disabled={isDownloading || isDeleting}
                            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {isDeleting ? (
                              <>
                                <svg
                                  className="animate-spin h-3 w-3"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                Deleting
                              </>
                            ) : (
                              'Delete'
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  No certificate files uploaded yet.
                </p>
              )}
            </div>

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Delete Certificate
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Are you sure you want to delete &quot;
                    {showDeleteConfirm.fileName.replace(/^\d+_/, '')}&quot;?
                    This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(null)}
                      disabled={deletingFile === showDeleteConfirm.fileName}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() =>
                        handleDeleteCertificate({
                          id: showDeleteConfirm.id,
                          name: showDeleteConfirm.fileName,
                          path: '',
                          size: 0,
                          createdAt: null,
                        })
                      }
                      disabled={deletingFile === showDeleteConfirm.fileName}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingFile === showDeleteConfirm.fileName
                        ? 'Deleting...'
                        : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Details */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Details</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Serial Number</div>
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
                <div className="text-xs text-gray-500 mb-1">Retail Price</div>
                <div className="text-sm font-medium text-gray-900">
                  {formatInstrumentPrice(instrument.price)}
                </div>
              </div>

              {instrument.cost_price !== null &&
                instrument.cost_price !== undefined && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Cost Price</div>
                    <div className="text-sm text-gray-900">
                      {formatInstrumentPrice(instrument.cost_price)}
                    </div>
                  </div>
                )}

              {instrument.consignment_price !== null &&
                instrument.consignment_price !== undefined && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">
                      Consignment Price
                    </div>
                    <div className="text-sm text-gray-900">
                      {formatInstrumentPrice(instrument.consignment_price)}
                    </div>
                  </div>
                )}

              {instrument.size && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Size</div>
                  <div className="text-sm text-gray-900">{instrument.size}</div>
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

              <div className="col-span-2">
                <div className="text-xs text-gray-500 mb-1">Certificate</div>
                <div className="text-sm text-gray-900">
                  {hasCertificateFile ? 'Yes' : 'No'}
                </div>
              </div>

              {ownerLabel && ownerLabel !== '—' && (
                <div className="col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Owner</div>
                  {ownerClient ? (
                    <Link
                      href={`/clients?clientId=${ownerClient.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {ownerLabel}
                    </Link>
                  ) : (
                    <div className="text-sm text-gray-900">{ownerLabel}</div>
                  )}
                </div>
              )}

              <div className="col-span-2">
                <div className="text-xs text-gray-500 mb-1">Clients</div>
                {clients.length > 0 ? (
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {clients.map(rel => {
                      const clientName = rel.client
                        ? formatClientName(rel.client)
                        : 'Client';
                      const relationship = rel.relationship_type || 'Client';
                      return rel.client_id ? (
                        <Link
                          key={rel.id}
                          href={`/clients?clientId=${rel.client_id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {clientName}
                          <span className="text-gray-500 ml-1">
                            ({relationship})
                          </span>
                        </Link>
                      ) : (
                        <span key={rel.id} className="text-sm text-gray-700">
                          {clientName}
                          <span className="text-gray-500 ml-1">
                            ({relationship})
                          </span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">—</div>
                )}
              </div>

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
      </td>
    </tr>
  );
}
