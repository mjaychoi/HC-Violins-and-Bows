import { DataQuality } from '../types';

interface DataQualityWarningProps {
  dataQuality: DataQuality;
}

export default function DataQualityWarning({ dataQuality }: DataQualityWarningProps) {
  if (!dataQuality.isLowQuality) return null;

  const messages: string[] = [];
  if (dataQuality.hasInsufficientData) {
    messages.push('Too few transactions to show meaningful patterns.');
  }
  if (dataQuality.hasOutliers) {
    messages.push('Some transactions have unusually high values that may skew averages.');
  }
  if (dataQuality.hasSparseDates) {
    messages.push('Data is spread across many days, making daily patterns less reliable.');
  }
  messages.push('Charts and insights may not be fully representative.');

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-yellow-900 mb-1">Limited Data Available</h4>
          <p className="text-sm text-yellow-700">
            {messages.join(' ')}
          </p>
        </div>
      </div>
    </div>
  );
}
