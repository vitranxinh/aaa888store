"use client";

import { useEffect, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  allowNegative?: boolean;
};

function parseFormattedNumber(value: string, allowNegative = false) {
  const isNegative = allowNegative && value.trim().startsWith("-");
  const normalized = value.replace(/[^\d]/g, "");
  const amount = normalized ? Number(normalized) : 0;
  return isNegative ? -amount : amount;
}

function formatInputNumber(value: number) {
  return value ? value.toLocaleString("vi-VN") : "0";
}

export function FormattedNumberInput({ value, onValueChange, min, max, allowNegative, className, onFocus, onBlur, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatInputNumber(value));

  useEffect(() => {
    if (!focused) {
      setText(formatInputNumber(value));
    }
  }, [focused, value]);

  function clamp(nextValue: number) {
    let clamped = nextValue;
    if (typeof min === "number" && clamped > 0) clamped = Math.max(min, clamped);
    if (typeof max === "number") clamped = Math.min(max, clamped);
    return clamped;
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      value={text}
      className={cn(className)}
      onFocus={(event) => {
        setFocused(true);
        setText(value ? value.toLocaleString("vi-VN") : "");
        onFocus?.(event);
      }}
      onChange={(event) => {
        const nextValue = clamp(parseFormattedNumber(event.target.value, allowNegative));
        setText(event.target.value.replace(allowNegative ? /[^\d.,\s-]/g : /[^\d.,\s]/g, ""));
        onValueChange(nextValue);
      }}
      onBlur={(event) => {
        setFocused(false);
        const nextValue = parseFormattedNumber(event.target.value, allowNegative);
        const minValue = typeof min === "number" && nextValue === 0 ? min : nextValue;
        const finalValue = clamp(minValue);
        onValueChange(finalValue);
        setText(formatInputNumber(finalValue));
        onBlur?.(event);
      }}
    />
  );
}
