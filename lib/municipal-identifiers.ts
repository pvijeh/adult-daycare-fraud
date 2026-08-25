const BBL_PATTERN = /^\d{10}$/;
const BIN_PATTERN = /^\d{7}$/;

function validateIdentifier(
  value: string,
  pattern: RegExp,
): string | null {
  const candidate = value.trim();
  return pattern.test(candidate) ? candidate : null;
}

export function validateBbl(value: string): string | null {
  return validateIdentifier(value, BBL_PATTERN);
}

export function validateBin(value: string): string | null {
  return validateIdentifier(value, BIN_PATTERN);
}
