import { readFileSync } from 'fs';
import path from 'path';
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import {
  assertCookieBackedAuth,
  validateProtectedApiAccess,
  waitForPageLoad,
} from './test-helpers';

async function expectOkJson(response: APIResponse) {
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return JSON.parse(body);
}

async function createClient(page: Page, nameSuffix: string) {
  const response = await page.request.post('/api/clients', {
    data: {
      first_name: `Schema`,
      last_name: `Hardening ${nameSuffix}`,
      email: '',
      contact_number: null,
      client_number: 'FORGED-CLIENT-NUMBER',
      org_id: '00000000-0000-0000-0000-000000000000',
      tags: ['E2E'],
      interest: 'Schema hardening',
      note: nameSuffix,
    },
  });
  const json = await expectOkJson(response);
  expect(json.data.client_number).toMatch(/^CL\d+$/);
  return json.data as {
    id: string;
    first_name: string;
    last_name: string;
    client_number: string;
  };
}

async function createInstrument(page: Page, suffix: string) {
  const response = await page.request.post('/api/instruments', {
    data: {
      type: 'Violin',
      maker: `Schema Hardening ${suffix}`,
      year: 2026,
      price: 1000,
      status: 'Available',
      ownership: 'owned',
      note: suffix,
    },
  });
  const json = await expectOkJson(response);
  return json.data as { id: string; maker: string };
}

async function cleanup(page: Page, paths: string[]) {
  for (const path of paths.reverse()) {
    await page.request.delete(path).catch(() => undefined);
  }
}

type InstrumentImageMetadata = {
  id: string;
  instrument_id: string;
  image_url: string;
  storage_key: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  display_order: number;
  created_at: string;
};

const tinyPngBase64 = readFileSync(
  path.join(process.cwd(), 'tests/e2e/fixtures/tiny-pixel.png.base64'),
  'utf8'
).trim();

async function uploadInstrumentImagesViaBrowser(
  page: Page,
  instrumentId: string,
  files: Array<{ name: string; base64: string }>
) {
  return page.evaluate(
    async ({ id, uploads }) => {
      const formData = new FormData();

      for (const upload of uploads) {
        const binary = atob(upload.base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        formData.append(
          'images',
          new File([bytes], upload.name, { type: 'image/png' })
        );
      }

      const response = await fetch(`/api/instruments/${id}/images`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const body = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    },
    { id: instrumentId, uploads: files }
  );
}

function expectImageMetadata(
  image: InstrumentImageMetadata,
  instrumentId: string,
  displayOrder: number
) {
  expect(image.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
  expect(image.instrument_id).toBe(instrumentId);
  expect(image.storage_key).toContain(`/${instrumentId}/`);
  expect(image.file_name).toMatch(/\.png$/);
  expect(image.file_size).toBeGreaterThan(0);
  expect(image.mime_type).toBe('image/png');
  expect(image.display_order).toBe(displayOrder);
}

test.describe('Schema hardening persisted flows', () => {
  test('client create with client_number persists after reload', async ({
    page,
  }) => {
    await assertCookieBackedAuth(page);
    expect((await validateProtectedApiAccess(page)).status).toBe(200);

    const suffix = `${Date.now()}`;
    const client = await createClient(page, suffix);

    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 20000, { skipNetworkIdle: true });

    const response = await page.request.get(`/api/clients?search=${suffix}`);
    const json = await expectOkJson(response);
    const persisted = json.data.find(
      (row: { id: string }) => row.id === client.id
    );

    expect(persisted).toBeTruthy();
    expect(persisted.client_number).toBe(client.client_number);
    expect(persisted.client_number).not.toBe('FORGED-CLIENT-NUMBER');

    await cleanup(page, [`/api/clients?id=${client.id}`]);
  });

  test('connection create/reorder persists after reload', async ({ page }) => {
    await assertCookieBackedAuth(page);

    const suffix = `${Date.now()}`;
    const client = await createClient(page, `Connection ${suffix}`);
    const instrumentA = await createInstrument(page, `A ${suffix}`);
    const instrumentB = await createInstrument(page, `B ${suffix}`);
    const cleanupPaths = [
      `/api/clients?id=${client.id}`,
      `/api/instruments?id=${instrumentA.id}`,
      `/api/instruments?id=${instrumentB.id}`,
    ];

    try {
      const first = await expectOkJson(
        await page.request.post('/api/connections', {
          data: {
            client_id: client.id,
            instrument_id: instrumentA.id,
            relationship_type: 'Interested',
            notes: `first ${suffix}`,
          },
        })
      );
      const second = await expectOkJson(
        await page.request.post('/api/connections', {
          data: {
            client_id: client.id,
            instrument_id: instrumentB.id,
            relationship_type: 'Interested',
            notes: `second ${suffix}`,
          },
        })
      );

      cleanupPaths.push(
        `/api/connections?id=${first.data.id}`,
        `/api/connections?id=${second.data.id}`
      );

      await expectOkJson(
        await page.request.put('/api/connections', {
          data: {
            orders: [
              { id: second.data.id, display_order: 0 },
              { id: first.data.id, display_order: 1 },
            ],
          },
        })
      );

      await page.goto('/connections', { waitUntil: 'domcontentloaded' });
      await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
      await page.reload({ waitUntil: 'domcontentloaded' });

      const list = await expectOkJson(
        await page.request.get(
          `/api/connections?client_id=${client.id}&all=true&orderBy=display_order`
        )
      );
      const ids = list.data.map((row: { id: string }) => row.id);

      expect(ids).toEqual([second.data.id, first.data.id]);
      expect(
        list.data.map((row: { display_order: number }) => row.display_order)
      ).toEqual([0, 1]);
    } finally {
      await cleanup(page, cleanupPaths);
    }
  });

  test('instrument image upload persists metadata and reloads entries', async ({
    page,
  }) => {
    await assertCookieBackedAuth(page);

    const suffix = `${Date.now()}`;
    const instrument = await createInstrument(page, `Images ${suffix}`);
    const cleanupPaths = [`/api/instruments?id=${instrument.id}`];
    const uploadedImageIds: string[] = [];

    try {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await waitForPageLoad(page, 20000, { skipNetworkIdle: true });

      const uploadResult = await uploadInstrumentImagesViaBrowser(
        page,
        instrument.id,
        [
          { name: `schema-hardening-a-${suffix}.png`, base64: tinyPngBase64 },
          { name: `schema-hardening-b-${suffix}.png`, base64: tinyPngBase64 },
        ]
      );

      expect(uploadResult.status, uploadResult.body).toBe(200);
      const uploadJson = JSON.parse(uploadResult.body);
      expect(uploadJson.metadata.uploadedCount).toBe(2);
      expect(uploadJson.data).toHaveLength(2);

      const uploaded = uploadJson.data as InstrumentImageMetadata[];
      uploaded.forEach((image, index) => {
        uploadedImageIds.push(image.id);
        expectImageMetadata(image, instrument.id, index);
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForPageLoad(page, 20000, { skipNetworkIdle: true });

      const list = await expectOkJson(
        await page.request.get(`/api/instruments/${instrument.id}/images`)
      );
      expect(list.data).toHaveLength(2);

      const persisted = list.data as InstrumentImageMetadata[];
      expect(persisted.map(image => image.id)).toEqual(
        uploaded.map(image => image.id)
      );
      persisted.forEach((image, index) => {
        expectImageMetadata(image, instrument.id, index);
        expect(image.image_url).toBeTruthy();
      });
      expect(persisted.map(image => image.file_name)).toHaveLength(2);
      expect(persisted.map(image => image.display_order)).toEqual([0, 1]);
      expect(
        persisted.some(image =>
          /SCHEMA_OUT_OF_DATE|Database migration required/i.test(
            JSON.stringify(image)
          )
        )
      ).toBe(false);
    } finally {
      await cleanup(
        page,
        uploadedImageIds.map(
          imageId =>
            `/api/instruments/${instrument.id}/images?imageId=${imageId}`
        )
      );
      await cleanup(page, cleanupPaths);
    }
  });
});
