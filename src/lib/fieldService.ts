'use client';

import { databases } from '@/app/appwrite';
import { ID } from 'appwrite';
import type { Field } from '@/types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const FIELDS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!;

export interface CreateFieldData {
  name: string;
  type?: string;
  location?: string;
  lat?: number;
  long?: number;
  fieldNumber: number;
  organizationId?: string;
}

class FieldService {
  async createField(data: CreateFieldData): Promise<Field> {
    const response = await databases.createRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: ID.unique(),
      data,
    });
    return response as unknown as Field;
  }
}

export const fieldService = new FieldService();

