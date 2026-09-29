import { zodResolver } from '@hookform/resolvers/zod';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import {
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
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

  // 关键 1：订阅 formState，校验错误才会触发 Form 重渲染。
  // 关键 2：render-prop 必须拿到**会变身份**的 formState——项目开了 React Compiler，
  // 直接写 `children(methods)` 时那个调用结果会被 memo 住（methods 身份稳定），
  // 于是重渲染也不会重新执行 children，界面上一个错误提示都不显示。
  const formState = useFormState({ control: methods.control });

  return (
    <FormProvider {...methods}>
      <form
        className={cn('space-y-6', className)}
        onSubmit={methods.handleSubmit(onSubmit)}
        id={id}
      >
        {children({ ...methods, formState })}
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
    { className, type = 'text', label, error, registration, id, ...props },
    ref,
  ) {
    // label 必须与控件真正关联（htmlFor/id），否则读屏与 getByLabelText 都定位不到；
    // 优先拿字段名当 id，一个表单里天然唯一
    const generatedId = React.useId();
    const inputId = id ?? registration?.name ?? generatedId;

    return (
      <div className={cn('w-full', className)}>
        {label ? (
          <LabelPrimitive.Root
            htmlFor={inputId}
            className="mb-1 block text-sm font-medium"
          >
            {label}
          </LabelPrimitive.Root>
        ) : null}
        <input
          id={inputId}
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
  function Textarea(
    { className, label, error, registration, id, ...props },
    ref,
  ) {
    const generatedId = React.useId();
    const textareaId = id ?? registration?.name ?? generatedId;

    return (
      <div className={cn('w-full', className)}>
        {label ? (
          <LabelPrimitive.Root
            htmlFor={textareaId}
            className="mb-1 block text-sm font-medium"
          >
            {label}
          </LabelPrimitive.Root>
        ) : null}
        <textarea
          id={textareaId}
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
