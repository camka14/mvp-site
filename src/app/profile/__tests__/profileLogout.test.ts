import { logoutProfileSession } from '../profileLogout';

describe('logoutProfileSession', () => {
  it('clears both contexts and routes only after logout succeeds', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    const setUser = jest.fn();
    const setAuthUser = jest.fn();
    const replace = jest.fn();
    const refresh = jest.fn();

    await logoutProfileSession({ logout, setUser, setAuthUser, replace, refresh });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith(null);
    expect(setAuthUser).toHaveBeenCalledWith(null);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not clear contexts or route when logout fails', async () => {
    const logout = jest.fn().mockRejectedValue(new Error('logout failed'));
    const setUser = jest.fn();
    const setAuthUser = jest.fn();
    const replace = jest.fn();
    const refresh = jest.fn();

    await expect(logoutProfileSession({ logout, setUser, setAuthUser, replace, refresh }))
      .rejects.toThrow('logout failed');
    expect(setUser).not.toHaveBeenCalled();
    expect(setAuthUser).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
