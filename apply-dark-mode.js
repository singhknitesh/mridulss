import fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

const transforms = {
  'bg-white': 'bg-white dark:bg-slate-900',
  'bg-gray-50': 'bg-gray-50 dark:bg-slate-800',
  'bg-gray-100': 'bg-gray-100 dark:bg-slate-700/50',
  'text-gray-900': 'text-gray-900 dark:text-gray-100',
  'text-gray-800': 'text-gray-800 dark:text-gray-200',
  'text-gray-700': 'text-gray-700 dark:text-gray-300',
  'text-gray-600': 'text-gray-600 dark:text-gray-400',
  'text-gray-500': 'text-gray-500 dark:text-gray-400',
  'border-gray-100': 'border-gray-100 dark:border-slate-800',
  'border-gray-200': 'border-gray-200 dark:border-slate-700',
  'shadow-sm': 'shadow-sm dark:shadow-none',
  'shadow-lg': 'shadow-lg dark:shadow-none',
  'shadow-xl': 'shadow-xl dark:shadow-none',
};

// First pass: remove any dark: classes we might have added previously to make it idempotent
for (const [original, replaced] of Object.entries(transforms)) {
  content = content.split(replaced).join(original);
}

// Second pass: apply the classes globally using regex
for (const [original, replaced] of Object.entries(transforms)) {
  const regex = new RegExp(`\\b${original}\\b`, 'g');
  content = content.replace(regex, replaced);
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully applied dark mode classes');
