import { act, fireEvent, renderHook } from '@testing-library/react';

import { useJoinCardDocking } from '../useJoinCardDocking';

function rect({
    top,
    left,
    width,
    height,
}: {
    top: number;
    left: number;
    width: number;
    height: number;
}): DOMRect {
    return {
        top,
        left,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
    };
}

function setViewport(width: number, height: number) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

describe('useJoinCardDocking', () => {
    let scheduledFrame: FrameRequestCallback | null;

    beforeEach(() => {
        scheduledFrame = null;
        setViewport(1440, 900);
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            scheduledFrame = callback;
            return 1;
        });
        jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('measures and docks a desktop join card on the scheduled initial frame', () => {
        const { result } = renderHook(() => useJoinCardDocking({ active: true, inline: true }));
        const anchor = document.createElement('div');
        const card = document.createElement('div');
        jest.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(rect({
            top: 400,
            left: 880,
            width: 360,
            height: 0,
        }));
        jest.spyOn(card, 'getBoundingClientRect').mockReturnValue(rect({
            top: 400,
            left: 880,
            width: 360,
            height: 280,
        }));
        act(() => {
            result.current.anchorRef.current = anchor;
            result.current.cardRef.current = card;
            scheduledFrame?.(0);
        });

        expect(result.current.layout).toEqual({
            docked: true,
            height: 280,
            left: 880,
            width: 360,
        });
    });

    it('keeps the card in normal flow below the desktop holding threshold', () => {
        const { result } = renderHook(() => useJoinCardDocking({ active: true, inline: true }));
        const anchor = document.createElement('div');
        const card = document.createElement('div');
        jest.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(rect({
            top: 700,
            left: 880,
            width: 360,
            height: 0,
        }));
        jest.spyOn(card, 'getBoundingClientRect').mockReturnValue(rect({
            top: 700,
            left: 880,
            width: 360,
            height: 280,
        }));
        act(() => {
            result.current.anchorRef.current = anchor;
            result.current.cardRef.current = card;
            fireEvent.scroll(window);
        });

        expect(result.current.layout.docked).toBe(false);
        expect(result.current.layout.height).toBe(280);
    });

    it('undocks on a mobile viewport without discarding the last measurement', () => {
        const { result } = renderHook(() => useJoinCardDocking({ active: true, inline: true }));
        const anchor = document.createElement('div');
        const card = document.createElement('div');
        jest.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(rect({
            top: 100,
            left: 880,
            width: 360,
            height: 0,
        }));
        jest.spyOn(card, 'getBoundingClientRect').mockReturnValue(rect({
            top: 100,
            left: 880,
            width: 360,
            height: 280,
        }));
        act(() => {
            result.current.anchorRef.current = anchor;
            result.current.cardRef.current = card;
            fireEvent.scroll(window);
        });
        expect(result.current.layout.docked).toBe(true);

        setViewport(800, 900);
        act(() => fireEvent.resize(window));

        expect(result.current.layout).toEqual({
            docked: false,
            height: 280,
            left: 880,
            width: 360,
        });
    });

    it('returns an empty layout and cleans the scheduled frame when inactive', () => {
        const { result, rerender } = renderHook(
            ({ active }) => useJoinCardDocking({ active, inline: true }),
            { initialProps: { active: true } },
        );

        rerender({ active: false });

        expect(result.current.layout).toEqual({ docked: false, height: 0, left: 0, width: 0 });
        expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    });
});
