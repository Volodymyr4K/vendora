import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../event-bus/bus.js';
import { Queue } from 'bullmq';

// Mock BullMQ
vi.mock('bullmq', () => ({
    Queue: vi.fn()
}));

describe('EventBus', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockQueue: any;
    let eventBus: EventBus;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create mock queue with spy methods
        mockQueue = {
            add: vi.fn().mockResolvedValue({}),
            close: vi.fn().mockResolvedValue(undefined)
        };

        // Mock Queue constructor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(Queue).mockImplementation(() => mockQueue as any);

        // Create EventBus instance
        eventBus = new EventBus('redis://localhost:6379');
    });

    describe('Publishing Events', () => {
        it('should publish event to BullMQ queue', async () => {
            const event = {
                eventId: 'evt-1',
                occurredAt: new Date().toISOString(),
                eventType: 'menu.updated' as const,
                tenantId: 'tenant-123'
            };
            await eventBus.publish('menu.updated', event);

            expect(mockQueue.add).toHaveBeenCalledTimes(1);
            expect(mockQueue.add).toHaveBeenCalledWith('menu.updated', event, {
                deduplication: { id: `event:${event.eventId}` }
            });
        });

        it('should publish different event types', async () => {
            const payload = {
                eventId: 'evt-1',
                occurredAt: new Date().toISOString(),
                eventType: 'order.created' as const,
                orderId: 'order-456',
                tenantId: 'tenant-123',
                branchSlug: 'branch-slug-456',
                total: 100,
                currency: 'UAH'
            };

            await eventBus.publish('order.created', payload);

            expect(mockQueue.add).toHaveBeenCalledWith('order.created', payload, {
                deduplication: { id: `event:${payload.eventId}` }
            });
        });

        it('should handle events with optional fields', async () => {
            const complexPayload = {
                eventId: 'evt-2',
                occurredAt: new Date().toISOString(),
                eventType: 'menu.updated' as const,
                tenantId: 'tenant-123',
                branchSlug: 'branch-123'
            };

            await eventBus.publish('menu.updated', complexPayload);

            expect(mockQueue.add).toHaveBeenCalledWith('menu.updated', complexPayload, {
                deduplication: { id: `event:${complexPayload.eventId}` }
            });
        });
    });

    describe('Error Handling', () => {
        it('should throw error on publish failure', async () => {
            const error = new Error('Redis connection failed');
            mockQueue.add.mockRejectedValue(error);

            await expect(
                eventBus.publish('menu.updated', {
                    eventId: 'evt-err-1',
                    occurredAt: new Date().toISOString(),
                    eventType: 'menu.updated',
                    tenantId: 'tenant-123'
                })
            ).rejects.toThrow('Redis connection failed');
        });

        it('should propagate BullMQ errors', async () => {
            mockQueue.add.mockRejectedValue(new Error('Queue full'));

            await expect(
                eventBus.publish('menu.updated', {
                    eventId: 'evt-err-2',
                    occurredAt: new Date().toISOString(),
                    eventType: 'menu.updated',
                    tenantId: 'tenant-123'
                })
            ).rejects.toThrow('Queue full');
        });
    });

    describe('Queue Configuration', () => {
        it('should configure queue with correct Redis URL', () => {
            const redisUrl = 'redis://custom-host:1234';
            new EventBus(redisUrl);

            expect(Queue).toHaveBeenCalledWith(
                'vendora-main',
                expect.objectContaining({
                    connection: { url: redisUrl }
                })
            );
        });

        it('should configure default job options', () => {
            new EventBus('redis://localhost:6379');

            expect(Queue).toHaveBeenCalledWith(
                'vendora-main',
                expect.objectContaining({
                    defaultJobOptions: {
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 1000
                        },
                        removeOnComplete: { count: 100 },
                        removeOnFail: { count: 1000 }
                    }
                })
            );
        });

        it('should use correct queue name', () => {
            new EventBus('redis://localhost:6379');

            expect(Queue).toHaveBeenCalledWith(
                'vendora-main',
                expect.any(Object)
            );
        });
    });

    describe('Graceful Shutdown', () => {
        it('should close queue connection gracefully', async () => {
            await eventBus.close();

            expect(mockQueue.close).toHaveBeenCalledTimes(1);
        });

        it('should handle close errors gracefully', async () => {
            mockQueue.close.mockRejectedValue(new Error('Close failed'));

            // Should not throw, just reject the promise
            await expect(eventBus.close()).rejects.toThrow('Close failed');
        });
    });

    describe('Multiple Events', () => {
        it('should publish multiple events in sequence', async () => {
            await eventBus.publish('menu.updated', {
                eventId: 'evt-seq-1',
                occurredAt: new Date().toISOString(),
                eventType: 'menu.updated',
                tenantId: 'tenant-1'
            });
            await eventBus.publish('order.created', {
                eventId: 'evt-1',
                occurredAt: new Date().toISOString(),
                eventType: 'order.created',
                orderId: 'order-1',
                tenantId: 'tenant-1',
                branchSlug: 'branch-1',
                total: 100,
                currency: 'UAH'
            });
            await eventBus.publish('menu.updated', {
                eventId: 'evt-seq-3',
                occurredAt: new Date().toISOString(),
                eventType: 'menu.updated',
                tenantId: 'tenant-2'
            });

            expect(mockQueue.add).toHaveBeenCalledTimes(3);
        });

        it('should maintain event order', async () => {
            await eventBus.publish('menu.updated', {
                eventId: 'evt-ord-1',
                occurredAt: new Date().toISOString(),
                eventType: 'menu.updated',
                tenantId: 'tenant-1'
            });
            await eventBus.publish('order.status_updated', {
                eventId: 'evt-2',
                occurredAt: new Date().toISOString(),
                eventType: 'order.status_updated',
                orderId: 'order-1',
                tenantId: 'tenant-1',
                oldStatus: 'pending',
                newStatus: 'confirmed'
            });

            const calls = mockQueue.add.mock.calls;
            expect(calls[0][0]).toBe('menu.updated');
            expect(calls[1][0]).toBe('order.status_updated');
        });
    });
});
