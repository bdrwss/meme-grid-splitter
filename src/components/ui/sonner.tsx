"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * 复刻原站：原站使用的是 shadcn 的 Toaster 包装（sonner v2），
 * 默认位置 bottom-right、默认非 richColors，并通过 className/toastOptions.classNames
 * 把 toast 的配色接到设计的 CSS 变量上。
 * 原站产物中的实现等价于：
 *   const { theme = "system" } = useTheme();
 *   <Sonner theme={theme} className="toaster group" toastOptions={{ classNames: {...} }} {...props} />
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };