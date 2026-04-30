import { Sliders } from 'lucide-react';
import { Input, Select } from '../../components/ui';
import type { ProductCustomField } from '../../types/product-custom-field.types';

export interface CustomFieldEntry {
  fieldId: string;
  value: string;
}

interface Props {
  fields: ProductCustomField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  errors?: Record<string, string | undefined>;
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
      {icon}
      {label}
    </div>
  );
}

function renderField(
  field: ProductCustomField,
  value: string,
  onChange: (v: string) => void,
  error?: string,
) {
  const label = `${field.name}${field.isRequired ? ' *' : ''}`;

  switch (field.type) {
    case 'NUMBER':
      return (
        <Input
          label={label}
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
        />
      );
    case 'DATE':
      return (
        <Input
          label={label}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
        />
      );
    case 'BOOLEAN':
      return (
        <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{label}</span>
        </label>
      );
    case 'SELECT': {
      const opts = (field.options ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => ({ value: o, label: o }));
      return (
        <Select
          label={label}
          options={[{ value: '', label: '— Seleccionar —' }, ...opts]}
          value={value}
          onChange={onChange}
          error={error}
        />
      );
    }
    case 'TEXT':
    default:
      return (
        <Input
          label={label}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
        />
      );
  }
}

export default function ProductCustomFieldsSection({ fields, values, onChange, errors }: Props) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Sliders className="w-3.5 h-3.5" />} label="Campos personalizados" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.id}>
            {renderField(
              f,
              values[f.id] ?? '',
              (v) => onChange(f.id, v),
              errors?.[f.id],
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
