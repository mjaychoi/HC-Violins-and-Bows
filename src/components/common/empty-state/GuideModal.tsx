'use client';

import React from 'react';
import { modalStyles } from '../modals/modalStyles';
import { ModalHeader } from '../modals/ModalHeader';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  steps: string[];
}

export function GuideModal({ isOpen, onClose, title, steps }: GuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className={modalStyles.overlay} onClick={onClose}>
      <div
        className={modalStyles.container}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-modal-title"
      >
        <ModalHeader
          title={title}
          icon="item"
          onClose={onClose}
          titleId="guide-modal-title"
        />
        <div className="px-6 py-4">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              다음 단계를 따라 첫 악기를 추가해보세요:
            </p>
            <ol className="space-y-3">
              {steps.map((step, index) => (
                <li key={index} className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold mr-3 mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-sm text-gray-700 flex-1 pt-0.5">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              시작하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
