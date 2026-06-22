import type { z } from 'zod';

export type FlattenedFormError = {
    path: string;
    message: string;
};

export const flattenFormErrors = (value: unknown, path: string[] = []): FlattenedFormError[] => {
    if (!value || typeof value !== 'object') {
        return [];
    }

    const node = value as Record<string, unknown>;
    const flattened: FlattenedFormError[] = [];
    if (typeof node.message === 'string' && node.message.trim().length > 0) {
        flattened.push({
            path: path.length ? path.join('.') : 'form',
            message: node.message,
        });
    }

    for (const [key, child] of Object.entries(node)) {
        if (key === 'message' || key === 'type' || key === 'ref') {
            continue;
        }
        flattened.push(...flattenFormErrors(child, [...path, key]));
    }

    return flattened;
};

export const dedupeValidationErrors = (issues: FlattenedFormError[]): FlattenedFormError[] => {
    const seen = new Set<string>();
    return issues.filter((issue) => {
        const path = issue.path.trim();
        const message = issue.message.trim();
        if (!message) {
            return false;
        }
        const key = `${path}::${message}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

export const flattenZodIssues = (issues: z.ZodIssue[]): FlattenedFormError[] => issues
    .map((issue) => ({
        path: issue.path.length ? issue.path.join('.') : 'form',
        message: issue.message,
    }))
    .filter((issue) => issue.message.trim().length > 0);
