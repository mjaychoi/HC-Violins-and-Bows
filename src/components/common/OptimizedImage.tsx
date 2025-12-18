/**
 * 최적화된 이미지 컴포넌트
 * next/image를 사용하여 자동 최적화 및 lazy loading 제공
 */

'use client';

import Image from 'next/image';
import { useState, useCallback } from 'react';
import { cn } from '@/utils/classNames';

export interface OptimizedImageProps {
  /**
   * 이미지 소스 URL 또는 경로
   */
  src: string;
  /**
   * 대체 텍스트 (접근성)
   */
  alt: string;
  /**
   * 이미지 너비 (필수: next/image는 width/height 또는 fill 필요)
   */
  width?: number;
  /**
   * 이미지 높이 (필수: next/image는 width/height 또는 fill 필요)
   */
  height?: number;
  /**
   * fill 모드 사용 여부 (부모 요소 크기에 맞춤)
   */
  fill?: boolean;
  /**
   * 이미지가 로드되기 전 표시할 placeholder
   */
  placeholder?: 'blur' | 'empty';
  /**
   * blur placeholder용 base64 데이터
   */
  blurDataURL?: string;
  /**
   * 이미지 크기 (responsive, fixed, intrinsic)
   * @default 'responsive'
   */
  sizes?: string;
  /**
   * 우선순위 (true면 eager loading, false면 lazy loading)
   * @default false
   */
  priority?: boolean;
  /**
   * 이미지 품질 (1-100)
   * @default 75
   */
  quality?: number;
  /**
   * 추가 클래스명
   */
  className?: string;
  /**
   * 객체 맞춤 방식 (object-fit)
   */
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  /**
   * 객체 위치 (object-position)
   */
  objectPosition?: string;
  /**
   * 클릭 핸들러
   */
  onClick?: () => void;
  /**
   * 로드 완료 핸들러
   */
  onLoad?: () => void;
  /**
   * 에러 핸들러
   */
  onError?: () => void;
}

/**
 * 최적화된 이미지 컴포넌트
 *
 * @example
 * ```tsx
 * // 기본 사용 (lazy loading)
 * <OptimizedImage
 *   src="/logo.png"
 *   alt="Logo"
 *   width={200}
 *   height={100}
 * />
 *
 * // Fill 모드 (부모 크기에 맞춤)
 * <div className="relative w-full h-64">
 *   <OptimizedImage
 *     src="/hero.jpg"
 *     alt="Hero image"
 *     fill
 *     objectFit="cover"
 *   />
 * </div>
 *
 * // 우선순위 이미지 (above-the-fold)
 * <OptimizedImage
 *   src="/hero.jpg"
 *   alt="Hero"
 *   width={1200}
 *   height={600}
 *   priority
 * />
 * ```
 */
export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  fill = false,
  placeholder = 'empty',
  blurDataURL,
  sizes,
  priority = false,
  quality = 75,
  className,
  objectFit = 'cover',
  objectPosition = 'center',
  onClick,
  onLoad,
  onError,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    onError?.();
  }, [onError]);

  // 에러 상태: 대체 UI 표시
  if (hasError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gray-100 text-gray-400',
          fill ? 'absolute inset-0' : '',
          className
        )}
        style={
          !fill && width && height ? { width, height } : fill ? {} : undefined
        }
      >
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  // Fill 모드
  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        placeholder={placeholder}
        blurDataURL={blurDataURL}
        sizes={
          sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        }
        priority={priority}
        quality={quality}
        className={cn(
          className,
          `object-${objectFit}`,
          objectPosition !== 'center' && `object-${objectPosition}`,
          isLoading && 'opacity-0 transition-opacity duration-300',
          !isLoading && 'opacity-100'
        )}
        style={{
          objectFit,
          objectPosition,
        }}
        onLoad={handleLoad}
        onError={handleError}
        onClick={onClick}
      />
    );
  }

  // Width/Height 모드
  if (!width || !height) {
    console.warn(
      'OptimizedImage: width and height are required when fill is false'
    );
    return null;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      placeholder={placeholder}
      blurDataURL={blurDataURL}
      sizes={sizes}
      priority={priority}
      quality={quality}
      className={cn(
        className,
        `object-${objectFit}`,
        objectPosition !== 'center' && `object-${objectPosition}`,
        isLoading && 'opacity-0 transition-opacity duration-300',
        !isLoading && 'opacity-100'
      )}
      style={{
        objectFit,
        objectPosition,
      }}
      onLoad={handleLoad}
      onError={handleError}
      onClick={onClick}
    />
  );
}
