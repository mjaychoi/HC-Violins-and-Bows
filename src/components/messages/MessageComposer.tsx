'use client';

import { useState, useMemo } from 'react';
import {
  TemplateKey,
  TemplateChannel,
  MESSAGE_TEMPLATES,
} from '@/types/messageTemplates';
import {
  renderTemplate,
  buildMailto,
  buildSmsLink,
} from '@/utils/renderTemplate';
import { Client, Instrument } from '@/types';
import { format } from 'date-fns';
import { Button } from '@/components/common/inputs';
import { useAppFeedback } from '@/hooks/useAppFeedback';

interface MessageComposerProps {
  client: Client | null;
  instrument?: Instrument | null;
  dueDate?: Date | string | null;
  amount?: number | string | null;
  quoteUrl?: string;
  invoiceUrl?: string;
  pickupWindow?: string;
  onClose?: () => void;
}

// Store settings (can be moved to settings/config later)
const STORE_SETTINGS = {
  storeName: process.env.NEXT_PUBLIC_STORE_NAME || 'HC Violins and Bows',
  storePhone: process.env.NEXT_PUBLIC_STORE_PHONE || '',
  storeAddress: process.env.NEXT_PUBLIC_STORE_ADDRESS || 'Seoul, South Korea',
};

export default function MessageComposer({
  client,
  instrument,
  dueDate,
  amount,
  quoteUrl,
  invoiceUrl,
  pickupWindow,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClose: _onClose, // Prefixed with _ to indicate intentionally unused
}: MessageComposerProps) {
  const { showSuccess } = useAppFeedback();
  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState<TemplateKey | null>(null);
  const [selectedChannel, setSelectedChannel] =
    useState<TemplateChannel>('email');

  // Get templates for selected key
  const availableTemplates = useMemo(() => {
    if (!selectedTemplateKey) return [];
    return MESSAGE_TEMPLATES.filter(
      t => t.key === selectedTemplateKey && t.channel === selectedChannel
    );
  }, [selectedTemplateKey, selectedChannel]);

  const selectedTemplate = availableTemplates[0] || null;

  // Auto-fill variables
  const templateVars = useMemo(() => {
    const clientName = client
      ? `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
        'Valued Customer'
      : undefined;

    const instrumentName = instrument
      ? `${instrument.maker || ''} ${instrument.type || ''}`.trim() ||
        instrument.type ||
        'instrument'
      : undefined;

    const formattedDueDate = dueDate
      ? typeof dueDate === 'string'
        ? format(new Date(dueDate), 'MMM d, yyyy h:mm a')
        : format(dueDate, 'MMM d, yyyy h:mm a')
      : undefined;

    const formattedAmount = amount
      ? typeof amount === 'number'
        ? `$${amount.toFixed(2)}`
        : amount
      : undefined;

    return {
      client_name: clientName,
      instrument: instrumentName,
      due_date: formattedDueDate,
      amount: formattedAmount,
      store_name: STORE_SETTINGS.storeName,
      store_phone: STORE_SETTINGS.storePhone || undefined, // Treat empty string as undefined
      store_address: STORE_SETTINGS.storeAddress,
      pickup_window: pickupWindow || undefined,
      quote_url: quoteUrl || undefined,
      invoice_url: invoiceUrl || undefined,
    };
  }, [client, instrument, dueDate, amount, quoteUrl, invoiceUrl, pickupWindow]);

  // Render template
  const rendered = useMemo(() => {
    if (!selectedTemplate) return { rendered: '', missing: [] };
    return renderTemplate(selectedTemplate.body, templateVars);
  }, [selectedTemplate, templateVars]);

  const renderedSubject = useMemo(() => {
    if (!selectedTemplate?.subject) return { rendered: '', missing: [] };
    return renderTemplate(selectedTemplate.subject, templateVars);
  }, [selectedTemplate, templateVars]);

  // Get unique template keys
  const templateKeys = useMemo(() => {
    const keys = new Set<TemplateKey>();
    MESSAGE_TEMPLATES.forEach(t => keys.add(t.key));
    return Array.from(keys);
  }, []);

  // Get channels for selected template key
  const availableChannels = useMemo(() => {
    if (!selectedTemplateKey) return [];
    const channels = new Set<TemplateChannel>();
    MESSAGE_TEMPLATES.filter(t => t.key === selectedTemplateKey).forEach(t =>
      channels.add(t.channel)
    );
    return Array.from(channels);
  }, [selectedTemplateKey]);

  // Handle copy to clipboard
  const handleCopy = async () => {
    if (!rendered.rendered) return;
    try {
      await navigator.clipboard.writeText(rendered.rendered);
      showSuccess('Copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Handle open in email/SMS
  const handleOpen = () => {
    if (!client || !rendered.rendered) return;

    if (selectedChannel === 'email') {
      if (!client.email) {
        alert('Client email not available');
        return;
      }
      const subject = renderedSubject.rendered || '';
      const mailtoLink = buildMailto(client.email, subject, rendered.rendered);
      window.location.href = mailtoLink;
    } else {
      // SMS
      if (!client.contact_number) {
        alert('Client phone number not available');
        return;
      }
      const smsLink = buildSmsLink(client.contact_number, rendered.rendered);
      window.location.href = smsLink;
    }
  };

  const hasMissingVars = rendered.missing.length > 0;
  const canSend = !hasMissingVars && client && rendered.rendered;

  return (
    <div className="space-y-4">
      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Template
        </label>
        <select
          value={selectedTemplateKey || ''}
          onChange={e => {
            setSelectedTemplateKey(e.target.value as TemplateKey | null);
            // Auto-select first available channel
            const firstChannel = MESSAGE_TEMPLATES.find(
              t => t.key === (e.target.value as TemplateKey)
            )?.channel;
            if (firstChannel) setSelectedChannel(firstChannel);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a template...</option>
          {templateKeys.map(key => {
            const firstTemplate = MESSAGE_TEMPLATES.find(t => t.key === key);
            return (
              <option key={key} value={key}>
                {firstTemplate?.label || key}
              </option>
            );
          })}
        </select>
      </div>

      {/* Channel Selection */}
      {selectedTemplateKey && availableChannels.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Channel
          </label>
          <div className="flex gap-2">
            {availableChannels.map(channel => (
              <button
                key={channel}
                type="button"
                onClick={() => setSelectedChannel(channel)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedChannel === channel
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {channel === 'email' ? '📧 Email' : '💬 SMS'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {selectedTemplate && (
        <div className="space-y-4">
          {/* Subject (email only) */}
          {selectedTemplate.channel === 'email' && renderedSubject.rendered && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm">
                {renderedSubject.rendered}
                {renderedSubject.missing.length > 0 && (
                  <span className="ml-2 text-red-500 text-xs">
                    (Missing: {renderedSubject.missing.join(', ')})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Body Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message Preview
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm whitespace-pre-wrap min-h-[200px]">
              {rendered.rendered}
            </div>
            {hasMissingVars && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  ⚠️ Missing variables: {rendered.missing.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCopy}
              disabled={!rendered.rendered}
            >
              📋 Copy to Clipboard
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleOpen}
              disabled={!canSend}
            >
              {selectedChannel === 'email'
                ? '📧 Open in Email'
                : '💬 Open in SMS'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
