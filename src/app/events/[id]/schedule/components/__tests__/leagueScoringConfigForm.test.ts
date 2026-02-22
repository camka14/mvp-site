import { applyLeagueScoringConfigFieldChange } from '../leagueScoringConfigForm';
import { createLeagueScoringConfig } from '@/types/defaults';

describe('leagueScoringConfigForm', () => {
  it('updates a scoring field and persists the next config', () => {
    const persist = jest.fn();
    const current = createLeagueScoringConfig({
      $id: 'cfg_1',
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
    });

    const next = applyLeagueScoringConfigFieldChange(
      current,
      'pointsForWin',
      5,
      persist,
    );

    expect(next.pointsForWin).toBe(5);
    expect(next.pointsForDraw).toBe(1);
    expect(next.$id).toBe('cfg_1');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        pointsForWin: 5,
        pointsForDraw: 1,
        pointsForLoss: 0,
        $id: 'cfg_1',
      }),
    );
  });

  it('hydrates defaults when current config is missing', () => {
    const persist = jest.fn();

    const next = applyLeagueScoringConfigFieldChange(
      undefined,
      'pointsForDraw',
      2,
      persist,
    );

    expect(next.pointsForDraw).toBe(2);
    expect(next.pointsForWin).toBe(0);
    expect(next.pointsForLoss).toBe(0);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        pointsForDraw: 2,
        pointsForWin: 0,
        pointsForLoss: 0,
      }),
    );
  });
});

