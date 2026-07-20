const MAX_LOCAL_PHONE_DIGITS = 10;

const localPhoneDigits = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits.slice(0, MAX_LOCAL_PHONE_DIGITS);
};

export const formatPhoneInput = (value: string): string => {
  const digits = localPhoneDigits(value);
  if (digits.length <= 3) return digits;

  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  const subscriber = digits.slice(6);

  if (!subscriber) return `(${areaCode}) ${exchange}`;
  return `(${areaCode}) ${exchange}-${subscriber}`;
};
