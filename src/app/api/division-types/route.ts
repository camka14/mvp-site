import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getGenderDivisionTypeOptions,
  getGlobalAgeDivisionTypeOptions,
  normalizeDivisionTypeParameterOptions,
} from '@/lib/divisionTypes';
import { ensureDefaultSports } from '@/server/defaultSports';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sports = await ensureDefaultSports(prisma);
  return NextResponse.json({
    genders: getGenderDivisionTypeOptions(),
    ages: getGlobalAgeDivisionTypeOptions(),
    sportSkills: sports.map((sport) => ({
      sportId: sport.id,
      sportName: sport.name ?? sport.id,
      skills: normalizeDivisionTypeParameterOptions((sport as any).skillDivisionTypes),
    })),
  }, { status: 200 });
}
