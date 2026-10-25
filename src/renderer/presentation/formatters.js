export const DISPLAY_LOCALE = 'ru-RU';
const BYTES_PER_KIBIBYTE = 1024;
const BYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE ** 2;
const fileSizeNumber = new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 1 });

export function formatFileSize(size) {
  if (size < BYTES_PER_KIBIBYTE) return `${size} Б`;
  if (size < BYTES_PER_MEBIBYTE) return `${fileSizeNumber.format(size / BYTES_PER_KIBIBYTE)} КБ`;
  return `${fileSizeNumber.format(size / BYTES_PER_MEBIBYTE)} МБ`;
}
