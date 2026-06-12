import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import SuperAdminPage from '@/app/super-admin/page';

const mockUpdateTenantThemeAction = vi.fn();
const mockGetSuperTenantsAction = vi.fn();

vi.mock('@/app/actions', () => ({
    getSuperTenantsAction: () => mockGetSuperTenantsAction(),
    createTenantAction: vi.fn(),
    updateTenantAction: vi.fn(),
    toggleTenantAction: vi.fn(),
    deleteTenantAction: vi.fn(),
    getTenantBranchesAction: vi.fn(),
    createBranchAction: vi.fn(),
    updateTenantThemeAction: (tenantId: string, theme: unknown) => mockUpdateTenantThemeAction(tenantId, theme),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
    },
}));

describe('SuperAdminPage Theme Save - Invalid JSON', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        mockGetSuperTenantsAction.mockResolvedValue([
            {
                id: 'test-tenant-id',
                name: 'Test Tenant',
                slug: 'test-tenant',
                isActive: true,
                countryCode: 'UA',
                currency: 'UAH',
                timezone: 'Europe/Kiev',
                createdAt: new Date().toISOString(),
            },
        ]);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        if (container.parentNode) {
            document.body.removeChild(container);
        }
    });

    it('should NOT get stuck in "Saving..." state on invalid JSON', async () => {
        await act(async () => {
            root.render(<SuperAdminPage />);
        });

        // Wait for initial data load
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
        });

        // Find Edit button
        const editButtons = Array.from(container.querySelectorAll('button'));
        const editButton = editButtons.find(btn => btn.textContent?.includes('✏️') || btn.getAttribute('title') === 'Edit Details');
        expect(editButton).toBeTruthy();

        await act(async () => {
            editButton!.click();
        });

        // Wait for modal
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        // Find textarea and set invalid JSON
        const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea).toBeTruthy();

        await act(async () => {
            Object.defineProperty(textarea, 'value', {
                writable: true,
                value: '{',
            });
            const inputEvent = new Event('input', { bubbles: true });
            const changeEvent = new Event('change', { bubbles: true });
            textarea.dispatchEvent(inputEvent);
            textarea.dispatchEvent(changeEvent);
        });

        // Find Save Theme button
        const allButtons = Array.from(container.querySelectorAll('button'));
        const saveThemeButton = allButtons.find(btn => 
            btn.textContent?.trim() === 'Save Theme' || btn.textContent?.trim() === 'Saving...'
        );
        expect(saveThemeButton).toBeTruthy();
        expect(saveThemeButton?.textContent?.trim()).toBe('Save Theme');
        expect(saveThemeButton?.disabled).toBe(false);

        await act(async () => {
            saveThemeButton!.click();
        });

        // Wait for async state updates
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
        });

        // Assert: Button should NOT be stuck in "Saving..." state
        const buttonsAfter = Array.from(container.querySelectorAll('button'));
        const saveButtonAfter = buttonsAfter.find(btn => 
            btn.textContent?.includes('Save Theme') || btn.textContent?.includes('Saving')
        );
        
        expect(saveButtonAfter).toBeTruthy();
        expect(saveButtonAfter?.textContent?.trim()).toBe('Save Theme');
        expect(saveButtonAfter?.disabled).toBe(false);

        // Assert: "Invalid JSON" error should be shown
        const errorDivs = Array.from(container.querySelectorAll('div'));
        const errorMessage = errorDivs.find(div => 
            div.textContent?.includes('Invalid JSON') || 
            div.classList.contains('text-red-800') ||
            div.classList.toString().includes('red-800')
        );
        expect(errorMessage).toBeTruthy();
        expect(errorMessage?.textContent).toContain('Invalid JSON');

        // Assert: updateTenantThemeAction should NOT have been called
        expect(mockUpdateTenantThemeAction).not.toHaveBeenCalled();
    });
});
