type ProfileLogoutDependencies = {
  logout: () => Promise<void>;
  setUser: (value: null) => void;
  setAuthUser: (value: null) => void;
  replace: (path: string) => void;
  refresh: () => void;
};

export const logoutProfileSession = async ({
  logout,
  setUser,
  setAuthUser,
  replace,
  refresh,
}: ProfileLogoutDependencies): Promise<void> => {
  await logout();
  setUser(null);
  setAuthUser(null);
  replace('/login');
  refresh();
};
