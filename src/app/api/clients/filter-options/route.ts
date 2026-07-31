import { NextRequest } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { assertClientsSchemaReadiness } from '@/app/api/_utils/schemaReadiness';
import { searchRateLimit, applyRateLimit } from '@/app/api/_utils/rateLimit';

/**
 * Distinct filter facet values for the /clients filter panel.
 * Sourced from the full organization client set (not the current page).
 */
async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'ClientsFilterOptionsAPI',
      context: 'ClientsFilterOptionsAPI',
    },
    async () => {
      if (!auth.orgId) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const { limited } = await applyRateLimit(searchRateLimit, auth.user.id);
      if (limited) {
        return {
          payload: { error: 'Too many requests', success: false },
          status: 429,
        };
      }

      await assertClientsSchemaReadiness({ supabase: auth.userSupabase });

      // Cap facet scan — enough for filter dropdowns without loading every column.
      const { data, error } = await auth.userSupabase
        .from('clients')
        .select('first_name, last_name, email, phone, tags, interest')
        .eq('org_id', auth.orgId)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) {
        return {
          payload: { error: 'Failed to load filter options', success: false },
          status: 500,
        };
      }

      const lastNames = new Set<string>();
      const firstNames = new Set<string>();
      const emails = new Set<string>();
      const contactNumbers = new Set<string>();
      const tags = new Set<string>();
      const interests = new Set<string>();

      for (const row of data ?? []) {
        if (row.last_name) lastNames.add(String(row.last_name));
        if (row.first_name) firstNames.add(String(row.first_name));
        if (row.email) emails.add(String(row.email));
        if (row.phone) contactNumbers.add(String(row.phone));
        if (row.interest) interests.add(String(row.interest));
        if (Array.isArray(row.tags)) {
          for (const tag of row.tags) {
            if (typeof tag === 'string' && tag.trim()) tags.add(tag.trim());
          }
        }
      }

      const sort = (values: Set<string>) =>
        [...values].sort((a, b) => a.localeCompare(b));

      return {
        payload: {
          data: {
            lastNames: sort(lastNames),
            firstNames: sort(firstNames),
            emails: sort(emails),
            contactNumbers: sort(contactNumbers),
            tags: sort(tags),
            interests: sort(interests),
          },
          /** Facet scan is capped; options may be incomplete above this size. */
          capped: (data?.length ?? 0) >= 5000,
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
