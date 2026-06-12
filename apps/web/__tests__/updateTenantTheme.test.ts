import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateTenantTheme } from '@/lib/server/mutations';
import type { ThemeV1 } from '@vendora/contracts';

const mockApiFetchWithAuth = vi.fn();

vi.mock('@/lib/server/api', () => ({
  apiFetchWithAuth: (url: string, init?: RequestInit) => mockApiFetchWithAuth(url, init),
}));

describe('updateTenantTheme', () => {
  const tenantId = '22222222-2222-4222-a222-222222222222';
  const theme: ThemeV1 = {
    version: 1,
    preset: 'default',
    tokens: {},
    brand: {},
  };

  const BFF = process.env.BFF_BASE_URL || 'http://localhost:3001';
  const expectedUrl = `${BFF}/super/tenants/${tenantId}/theme`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateTenantTheme handles 204 and sends PATCH to /super/tenants/:id/theme', async () => {
    // Arrange: Mock apiFetchWithAuth to return 204 No Content
    const mockJson = vi.fn().mockImplementation(() => {
      throw new Error('json() should not be called for 204 No Content');
    });
    const mockText = vi.fn().mockResolvedValue('');

    mockApiFetchWithAuth.mockResolvedValue({
      ok: true,
      status: 204,
      json: mockJson,
      text: mockText,
      statusText: 'No Content',
    });

    // Act
    await updateTenantTheme(tenantId, theme);

    // Assert: apiFetchWithAuth was called exactly once
    expect(mockApiFetchWithAuth).toHaveBeenCalledTimes(1);

    // Assert: Correct URL
    expect(mockApiFetchWithAuth).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(theme),
      })
    );

    // Assert: json() was not called (should throw if called)
    expect(mockJson).not.toHaveBeenCalled();
  });
});
