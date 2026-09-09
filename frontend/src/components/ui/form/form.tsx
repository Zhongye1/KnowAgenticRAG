import { zodResolver } from '@hookform/resolvers/zod';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import {
  FormProvider,
  useForm,
  useFormContext,
  type FieldError,
  type FieldValues,
  type UseFormProps,
  type UseFormRegisterReturn,
  type UseFormReturn,
} from 'react-hook-form';
import type { ZodType } from 'zod';

import { cn } from '@/utils/cn';

type FormProps<TFieldValues extends FieldValues> = {
  children: (methods: UseFormReturn<TFieldValues>) => React.ReactNode;
  onSubmit: (values: TFieldValues) => void;
  schema?: ZodType<TFieldValues>;
  options?: UseFormProps<TFieldValues>;
  className?: string;
  id?: string;
};

export function Form<TFieldValues extends FieldValues>({
  children,
  onSubmit,
  schema,
  options,
  className,
  id,
}: FormProps<TFieldValues>) {
  const methods = useForm<TFieldValues>({
    ...options,
    resolver: schema ? zodResolver(schema) : undefined,
  });

  return (
    <FormProvider {...methods}>
      <form
        className={cn('space-y-6', className)}
        onSubmit={methods.handleSubmit(onSubmit)}
        id={id}
      >
        {children(methods)}
      </form>
    </FormProvider>
  );
}

export function FieldError({
  name,
  className,
}: {
  name?: string;
  className?: string;
}) {
  const {
    formState: { errors },
  } = useFormContext();

  if (!name) return null;

  const error = (errors as unknown as Record<string, FieldError | undefined>)[
    name
  ];

  return error ? (
    <p
      className={cn('text-sm font-medium text-destructive', className)}
      role="alert"
    >
      {error.message}
    </p>
  ) : null;
}

function FieldErrorMessage({
  error,
}: {
  error?: FieldError | string | undefined;
}) {
  const message = typeof error === 'string' ? error : error?.message;

  return message ? (
    <p className="mt-1 text-sm font-medium text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref) {
        (ref as React.MutableRefObject<T>).current = value;
      }
    }
  };
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: FieldError | string | undefined;
  registration?: Partial<UseFormRegisterReturn>;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { className, type = 'text', label, error, registration, ...props },
    ref,
  ) {
    return (
      <div className={cn('w-full', className)}>
        {label ? (
          <LabelPrimitive.Root className="mb-1 block text-sm font-medium">
            {label}
          </LabelPrimitive.Root>
        ) : null}
        <input
          type={type}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          {...registration}
          {...props}
          ref={mergeRefs(ref, registration?.ref)}
        />
        <FieldErrorMessage error={error} />
      </div>
    );
  },
);

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: FieldError | string | undefined;
  registration?: Partial<UseFormRegisterReturn>;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, label, error, registration, ...props }, ref) {
    return (
      <div className={cn('w-full', className)}>
        {label ? (
          <LabelPrimitive.Root className="mb-1 block text-sm font-medium">
            {label}
          </LabelPrimitive.Root>
        ) : null}
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          {...registration}
          {...props}
          ref={mergeRefs(ref, registration?.ref)}
        />
        <FieldErrorMessage error={error} />
      </div>
    );
  },
);

export const Label = React.forwardRef<
  HTMLLabelElement,
  LabelPrimitive.LabelProps
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('text-sm font-medium leading-none', className)}
      {...props}
    />
  );
});
