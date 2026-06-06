jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import {
  buildRegistrationAnswerSnapshot,
  normalizeQuestionDrafts,
  type RegistrationQuestionRow,
} from '@/server/registrationQuestions';

const question = (overrides: Partial<RegistrationQuestionRow>): RegistrationQuestionRow => ({
  id: 'question-1',
  scopeType: 'TEAM',
  scopeId: 'scope-1',
  prompt: 'Why do you want to join?',
  answerType: 'TEXT',
  required: false,
  sortOrder: 0,
  isActive: true,
  ...overrides,
});

describe('registration question helpers', () => {
  it('normalizes question drafts and preserves manager-defined order', () => {
    expect(
      normalizeQuestionDrafts([
        {
          id: ' question-a ',
          prompt: ' Shirt size ',
          answerType: 'long_text',
          required: true,
          sortOrder: 7,
        },
        {
          prompt: 'Preferred position',
          answerType: 'unknown',
        },
      ]),
    ).toEqual([
      {
        id: 'question-a',
        prompt: 'Shirt size',
        answerType: 'LONG_TEXT',
        required: true,
        sortOrder: 7,
      },
      {
        id: null,
        prompt: 'Preferred position',
        answerType: 'TEXT',
        required: false,
        sortOrder: 1,
      },
    ]);
  });

  it('builds answer snapshots from active question definitions', () => {
    const snapshot = buildRegistrationAnswerSnapshot({
      questions: [
        question({
          id: 'question-a',
          prompt: 'Shirt size',
          required: true,
          sortOrder: 1,
        }),
        question({
          id: 'question-b',
          prompt: 'Anything else?',
          answerType: 'LONG_TEXT',
          sortOrder: 2,
        }),
      ],
      answers: [
        { questionId: 'question-a', answer: ' Large ' },
        { questionId: 'question-b', answer: 'Can help coach' },
      ],
    });

    expect(snapshot).toEqual([
      {
        questionId: 'question-a',
        prompt: 'Shirt size',
        answerType: 'TEXT',
        required: true,
        sortOrder: 1,
        answer: 'Large',
      },
      {
        questionId: 'question-b',
        prompt: 'Anything else?',
        answerType: 'LONG_TEXT',
        required: false,
        sortOrder: 2,
        answer: 'Can help coach',
      },
    ]);
  });

  it('requires answers for required questions', () => {
    expect(() =>
      buildRegistrationAnswerSnapshot({
        questions: [
          question({
            prompt: 'Emergency contact',
            required: true,
          }),
        ],
        answers: [],
      }),
    ).toThrow('Answer "Emergency contact" before continuing.');
    try {
      buildRegistrationAnswerSnapshot({
        questions: [
          question({
            prompt: 'Emergency contact',
            required: true,
          }),
        ],
        answers: [],
      });
    } catch (error) {
      expect((error as { status?: number }).status).toBe(400);
    }
  });
});
