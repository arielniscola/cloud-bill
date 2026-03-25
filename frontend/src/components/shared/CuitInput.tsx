interface CuitInputProps {
  value?: string | null;
  onChange: (rawDigits: string) => void;
  label?: string;
  error?: string;
  placeholder?: string;
  className?: string;
}

/** Formats up to 11 digits into XX-XXXXXXXX-X display format. */
function maskCuit(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits[10]}`;
}

export default function CuitInput({
  value,
  onChange,
  label,
  error,
  placeholder = '20-12345678-9',
  className,
}: CuitInputProps) {
  const display = maskCuit(value || '');

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
          onChange(raw);
        }}
        className={
          className ??
          'w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-[border-color,box-shadow] duration-150'
        }
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
