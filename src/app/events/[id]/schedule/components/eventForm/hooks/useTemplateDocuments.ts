import { useEffect, useState } from 'react';

import { apiRequest } from '@/lib/apiClient';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';
import type { TemplateDocument } from '@/types';

const normalizeTemplateType = (value: unknown): TemplateDocument['type'] => {
    if (typeof value === 'string' && value.toUpperCase() === 'TEXT') {
        return 'TEXT';
    }
    return 'PDF';
};

const mapTemplateRow = (row: Record<string, any>): TemplateDocument => {
    const roleIndexRaw = row?.roleIndex;
    const roleIndex = typeof roleIndexRaw === 'number' ? roleIndexRaw : Number(roleIndexRaw);
    const roleIndexesRaw = Array.isArray(row?.roleIndexes) ? row.roleIndexes : undefined;
    const roleIndexes = roleIndexesRaw
        ? roleIndexesRaw
            .map((entry: unknown) => Number(entry))
            .filter((value: number) => Number.isFinite(value))
        : undefined;
    const signerRolesRaw = Array.isArray(row?.signerRoles) ? row.signerRoles : undefined;
    const signerRoles = signerRolesRaw
        ? signerRolesRaw
            .filter((entry: unknown): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
            .map((entry: string) => entry.trim())
        : undefined;
    const signOnceRaw = row?.signOnce;
    const requiredSignerType = normalizeRequiredSignerType(row?.requiredSignerType);

    return {
        $id: String(row?.$id ?? ''),
        templateId: row?.templateId ?? undefined,
        organizationId: row?.organizationId ?? '',
        title: row?.title ?? 'Untitled Template',
        description: row?.description ?? undefined,
        signOnce: typeof signOnceRaw === 'boolean' ? signOnceRaw : signOnceRaw == null ? true : Boolean(signOnceRaw),
        status: row?.status ?? undefined,
        roleIndex: Number.isFinite(roleIndex) ? roleIndex : undefined,
        roleIndexes: roleIndexes && roleIndexes.length ? roleIndexes : undefined,
        signerRoles: signerRoles && signerRoles.length ? signerRoles : undefined,
        requiredSignerType,
        type: normalizeTemplateType(row?.type),
        content: row?.content ?? undefined,
        $createdAt: row?.$createdAt ?? undefined,
    };
};

export const useTemplateDocuments = (organizationId?: string | null) => {
    const [documents, setDocuments] = useState<TemplateDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!organizationId) {
            setDocuments([]);
            setError(null);
            return;
        }

        let cancelled = false;
        const loadTemplates = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await apiRequest<{ templates?: any[] }>(
                    `/api/organizations/${organizationId}/templates`,
                );
                const rows = Array.isArray(response.templates) ? response.templates : [];
                if (!cancelled) {
                    setDocuments(rows.map((row) => mapTemplateRow(row)));
                }
            } catch (loadError) {
                if (!cancelled) {
                    setDocuments([]);
                    setError(
                        loadError instanceof Error ? loadError.message : 'Failed to load templates.',
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadTemplates();

        return () => {
            cancelled = true;
        };
    }, [organizationId]);

    return {
        documents,
        loading,
        error,
    };
};
