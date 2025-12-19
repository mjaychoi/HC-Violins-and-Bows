# HC Violins & Bows — User Guide

This guide walks through the main flows in the inventory system so teams can use the app without digging through code. Each section explains what you see, what action to take, and how the UI reacts.

---

## 1. Sign In & Navigation

1. Open the app at `/` and sign in with your Supabase credentials (email + password).
2. The left-hand sidebar shows the primary sections: **Dashboard**, **Clients**, **Connections**, **Calendar**, **Sales**, and **Settings**.
3. Use the **top filters** (status, ownership, view modes) to keep data scoped as you navigate; filters persist per section.
4. The breadcrumb + tabs at the top help you know whether you are looking at month/week/day views, dashboards, or tasks.

## 2. Dashboard Overview

Purpose: instantly see inventory health, new clients, and actionable tasks.

- **KPI cards** summarize totals (Available instruments, Sold this week, Pending maintenance).
- **Filters panel** lets you drill down by instrument type, status, and certification. Each filter chip shows an active state and can be reset via the “Clear filters” button.
- **Inline editing** works directly in the grid (double-click a row to edit fields like Maker, Type, Status). Save/cancel buttons show in-place with confirmation to avoid losing work.
- **Row actions menu** (⋯) exposes contextual actions: download certificate, book instrument, mark for maintenance, or delete. The UI hides actions that don’t apply based on the instrument status.
- **Pagination controls** keep the list manageable; you can jump to any page or adjust the page size via the pager at the bottom.

## 3. Clients & Contacts

Purpose: maintain client records, track communications, and link instruments.

- The **Clients page** lists all customers with tags, last contact date, and spend summary.
- Use the **search bar** to look up clients by name, tags, or notes. A “Very long search term” that doesn’t match anything will return zero rows (guards against overmatching).
- The **“Add client”** button (top-right) opens a modal for new entries. Fill the contact details, assign tags, and optionally link instruments right away.
- **Contact logs** live under each client row. Expanding a client row reveals a timeline of emails, calls, and follow-ups with quick action buttons to launch a new log or schedule a follow-up.
- The **Today Follow-Ups** panel surfaces tasks due for contact follow-ups; you can complete or reschedule them from the same view.

## 4. Connections (Client-Instrument Mapping)

- Connections show which clients own or are interested in specific instruments.
- Hit **“New connection”** to assign a client to an instrument, describe the relationship (e.g., Sold, Booked, Interested), and capture notes.
- The **table** supports filtering by client ID or instrument ID via query parameters (accessible in the URL).
- Use the **pagination controls** and sort arrows to step through large datasets without losing context.

## 5. Instruments & Certificates

- The **Instruments registry** shares core details (maker, type, status, serial). Each row displays badges for certificates and maintains quick actions (view sales history, download certificate, delete).
- **Certificate documents** are generated via the `/api/certificates/[id]` route. When you click “Download certificate,” the API renders a PDF using the certificate document template.
- Use the **certificate badge** to identify instruments with an active certificate. Hovering reveals certificate generation metadata.

## 6. Calendar & Maintenance

- The **Calendar view** toggles between month/week/day/year/timeline. Use the toolbar to switch modes and jump to “Today”.
- **Filters on the calendar** include statuses, priorities, owners, and custom date ranges. The “Advanced Search” drawer exposes date range selectors and quick apply/reset buttons.
- **Tasks (maintenance jobs)** are grouped by date. Clicking a day opens the `GroupedTaskList`: collapsed rows show summary info; expand to edit priority/status inline or open the detail modal.
- Drag-and-drop is enabled. Moving a task to a new date instantly updates the Supabase record with rollback safeguards if the update fails.
- Events include tasks and follow-up logs. Clicking a task opens the `TaskModal`, while the context menu (`TaskActionMenu`) exposes deeper actions (view details, edit, delete).

## 7. Sales & Reporting

- The **Sales page** lists closed deals and revenue history.
- Filters: use the column filters to scope by instrument type, client, or sale date.
- **Pagination** splits the table into manageable pages. Graphs summarizing sales trends sit above the table.
- To create a new sale record, click **“New sale”** and fill in fields (instrument, client, sale price, date).

## 8. Notifications & Feedback

- Every major action surfaces toasts via `ToastContext`: success toasts, errors, and warnings all stack at the top-right corner.
- The **“Show Success”** button triggers a helper toast, while errors automatically use the centralized `handleError` logic to show consistent messaging.
- For repeated success messages, a history (click each toast) reveals clickable details and links.

## 9. Advanced Filters & Search

- The shared **filter drawer** (`useFilters`, `usePageFilters`) is used across Dashboard/Clients/Calendar.
- Search input supports fuzzy text matching. When you enter extremely long queries, the hook prevents matches by enforcing a maximum length and escaping special characters.
- For combinational filters (e.g., status + ownership + text), the UI highlights active filters and you can reset either individual filter or all of them via the “Reset” button.

## 10. Power Tools for Admins

- **Error Handling**: Global error handling wraps Supabase calls; check the `/logs` section of the UI (if available) to review aggregated errors.
- **Instrumentation**: Client and server instrumentation modules emit events for performance monitoring. Use the `instrumentation` endpoint to observe request timings.
- **Supabase schema checks**: Periodically run `npm run schema:check` to ensure the local schema matches production.
- **Database migrations**: Add new tables/columns via the migration scripts in `supabase/migrations/`. Run `npm run migrate:subtype` for subtype updates before deploying.

---

If you’d like a clickable walkthrough or annotated screenshots, I can help create a more visual guide next. Let me know what you'd like to add first.
