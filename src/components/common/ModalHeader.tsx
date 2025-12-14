'use client';

import React from 'react';
import { modalStyles, modalIconPaths, ModalHeaderProps } from './modalStyles';

/**
 * 모달 헤더 컴포넌트 (재사용 가능)
 */
export function ModalHeader({ title, icon, onClose, titleId }: ModalHeaderProps) {
  return (
    <div className={modalStyles.header}>
      <div className={modalStyles.headerContent}>
        <div className={modalStyles.headerLeft}>
          <div className={modalStyles.iconContainer}>
            <svg
              className={modalStyles.icon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={modalIconPaths[icon]}
              />
            </svg>
          </div>
          <h3 id={titleId} className={modalStyles.title}>
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={modalStyles.closeButton}
          aria-label="Close modal"
        >
          <svg
            className={modalStyles.closeIcon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={modalIconPaths.close}
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
