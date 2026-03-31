export type ProfileImageSelectionState = {
  profileImageId: string;
};

export const withSelectedProfileImage = <T extends ProfileImageSelectionState>(
  previous: T,
  fileId: string,
  _imageUrl: string,
): T => ({
  ...previous,
  profileImageId: fileId.trim(),
});
