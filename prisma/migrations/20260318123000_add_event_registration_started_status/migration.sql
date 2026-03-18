-- Add STARTED reservation state for purchase-intent capacity locking.
ALTER TYPE "EventRegistrationsStatusEnum" ADD VALUE IF NOT EXISTS 'STARTED';
