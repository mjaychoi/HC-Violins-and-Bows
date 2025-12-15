export type TemplateChannel = 'email' | 'sms';

export type TemplateKey =
  | 'thanks'
  | 'quote'
  | 'appointment_confirm'
  | 'repair_complete'
  | 'reminder'
  | 'invoice';

export type TemplateVar =
  | 'client_name'
  | 'instrument'
  | 'due_date'
  | 'amount'
  | 'store_name'
  | 'store_phone'
  | 'store_address'
  | 'pickup_window'
  | 'quote_url'
  | 'invoice_url';

export type MessageTemplate = {
  key: TemplateKey;
  channel: TemplateChannel;
  label: string;
  subject?: string; // email only
  body: string;
  allowedVars: TemplateVar[];
};

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // 1) 감사 / Thanks
  {
    key: 'thanks',
    channel: 'email',
    label: 'Thanks',
    subject: 'Thank you from {store_name}',
    body: `Hi {client_name},

Thank you for choosing {store_name}. We really appreciate it.

If you have any questions about your {instrument}, feel free to reply to this email or call/text us at {store_phone}.

Warmly,
{store_name}`,
    allowedVars: ['client_name', 'instrument', 'store_name', 'store_phone'],
  },
  {
    key: 'thanks',
    channel: 'sms',
    label: 'Thanks',
    body: `Hi {client_name}! Thanks for choosing {store_name}. If you need anything for your {instrument}, reply here anytime. ({store_phone})`,
    allowedVars: ['client_name', 'instrument', 'store_name', 'store_phone'],
  },

  // 2) 견적 / Quote
  {
    key: 'quote',
    channel: 'email',
    label: 'Quote',
    subject: '[{store_name}] Quote for {instrument}',
    body: `Hi {client_name},

Thanks for reaching out. Here's the quote for your {instrument}:

Estimated total: {amount}
Estimated completion / target date: {due_date}

You can review it here: {quote_url}

If you'd like to proceed, just reply "Approved" and we'll schedule the work.

Best,
{store_name}
{store_phone}`,
    allowedVars: [
      'client_name',
      'instrument',
      'amount',
      'due_date',
      'quote_url',
      'store_name',
      'store_phone',
    ],
  },
  {
    key: 'quote',
    channel: 'sms',
    label: 'Quote',
    body: `Hi {client_name}, this is {store_name}. Quote for your {instrument}: {amount}. Target date: {due_date}. Details: {quote_url}`,
    allowedVars: [
      'client_name',
      'instrument',
      'amount',
      'due_date',
      'quote_url',
      'store_name',
    ],
  },

  // 3) 예약 확인 / Appointment confirmation
  {
    key: 'appointment_confirm',
    channel: 'email',
    label: 'Appointment Confirmation',
    subject: '[{store_name}] Appointment confirmed — {due_date}',
    body: `Hi {client_name},

Your appointment is confirmed.

Date & time: {due_date}
Instrument: {instrument}
Location: {store_address}

If anything changes, reply here and we can reschedule.

See you soon,
{store_name}
{store_phone}`,
    allowedVars: [
      'client_name',
      'instrument',
      'due_date',
      'store_address',
      'store_name',
      'store_phone',
    ],
  },
  {
    key: 'appointment_confirm',
    channel: 'sms',
    label: 'Appointment Confirmation',
    body: `Confirmed ✅ {store_name}: {client_name}, your {instrument} appointment is set for {due_date}. Need changes? Reply here.`,
    allowedVars: ['client_name', 'instrument', 'due_date', 'store_name'],
  },

  // 4) 수리 완료 / Repair complete
  {
    key: 'repair_complete',
    channel: 'email',
    label: 'Repair Complete',
    subject: '[{store_name}] Your {instrument} is ready for pickup',
    body: `Hi {client_name},

Good news — your {instrument} is ready.

Recommended pickup window: {pickup_window}
Total due at pickup: {amount}

If you'd like to confirm a pickup time, just reply with what works for you.

Thank you,
{store_name}
{store_phone}
{store_address}`,
    allowedVars: [
      'client_name',
      'instrument',
      'pickup_window',
      'amount',
      'store_name',
      'store_phone',
      'store_address',
    ],
  },
  {
    key: 'repair_complete',
    channel: 'sms',
    label: 'Repair Complete',
    body: `Hi {client_name}! {store_name} here — your {instrument} is ready 🎻 Pickup window: {pickup_window}. Total: {amount}. Reply to coordinate.`,
    allowedVars: [
      'client_name',
      'instrument',
      'pickup_window',
      'amount',
      'store_name',
    ],
  },

  // 5) 리마인드 / Reminder (예약/픽업/결제 등 공용)
  {
    key: 'reminder',
    channel: 'email',
    label: 'Reminder',
    subject: '[{store_name}] Reminder — {instrument} on {due_date}',
    body: `Hi {client_name},

Just a quick reminder from {store_name}.

Instrument: {instrument}
Date & time: {due_date}

If you need to reschedule, reply to this email and we'll help.

Best,
{store_name}
{store_phone}`,
    allowedVars: [
      'client_name',
      'instrument',
      'due_date',
      'store_name',
      'store_phone',
    ],
  },
  {
    key: 'reminder',
    channel: 'sms',
    label: 'Reminder',
    body: `Reminder: {store_name} — {client_name}, your {instrument} is scheduled for {due_date}. Reply to reschedule if needed.`,
    allowedVars: ['client_name', 'instrument', 'due_date', 'store_name'],
  },

  // 6) 인보이스 안내 / Invoice
  {
    key: 'invoice',
    channel: 'email',
    label: 'Invoice',
    subject: '[{store_name}] Invoice — {instrument} ({amount})',
    body: `Hi {client_name},

Here is your invoice for the {instrument} service.

Amount: {amount}
Invoice link: {invoice_url}

If you have any questions about the invoice, reply here and we'll help right away.

Thank you,
{store_name}
{store_phone}`,
    allowedVars: [
      'client_name',
      'instrument',
      'amount',
      'invoice_url',
      'store_name',
      'store_phone',
    ],
  },
  {
    key: 'invoice',
    channel: 'sms',
    label: 'Invoice',
    body: `Hi {client_name}, {store_name} here. Invoice for your {instrument}: {amount}. View/pay: {invoice_url}`,
    allowedVars: [
      'client_name',
      'instrument',
      'amount',
      'invoice_url',
      'store_name',
    ],
  },
];
