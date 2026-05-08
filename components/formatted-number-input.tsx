"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  allowNegative?: boolean;
  allowDecimal?: boolean;
  maximumFractionDigits?: number;
};

function parseFormattedNumber(
  value: string,
  allowNegative = false,
  allowDecimal = false,
  maximumFractionDigits = 2
) {
  const isNegative = allowNegative && value.trim().startsWith("-");
  const sanitized = value.replace(allowDecimal ? /[^\d.,-]/g : /[^\d-]/g, "");

  if (!sanitized) return 0;

  if (!allowDecimal) {
    const normalized = sanitized.replace(/[^\d]/g, "");
    const amount = normalized ? Number(normalized) : 0;
    return isNegative ? -amount : amount;
  }

  const lastComma = sanitized.lastIndexOf(",");
  const lastDot = sanitized.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);

  const integerPart =
    separatorIndex >= 0 ? sanitized.slice(0, separatorIndex).replace(/[^\d]/g, "") : sanitized.replace(/[^\d]/g, "");
  const decimalPartRaw = separatorIndex >= 0 ? sanitized.slice(separatorIndex + 1).replace(/[^\d]/g, "") : "";
  const decimalPart = decimalPartRaw.slice(0, maximumFractionDigits);
  const normalized = decimalPart ? `${integerPart || "0"}.${decimalPart}` : integerPart || "0";
  const amount = Number(normalized);
  return isNegative ? -amount : amount;
}

function formatInputNumber(value: number, allowDecimal = false, maximumFractionDigits = 2) {
  if (!value) return "0";

  return value.toLocaleString("vi-VN", {
    minimumFractionDigits: allowDecimal ? 0 : 0,
    maximumFractionDigits: allowDecimal ? maximumFractionDigits : 0
  });
}

function countCursorTokens(
  value: string,
  cursor: number,
  allowNegative = false,
  allowDecimal = false
) {
  const beforeCursor = value.slice(0, cursor);
  let tokens = 0;
  let sawDecimal = false;
  let sawNegative = false;

  for (const char of beforeCursor) {
    if (/\d/.test(char)) {
      tokens += 1;
      continue;
    }

    if (allowDecimal && !sawDecimal && (char === "." || char === ",")) {
      tokens += 1;
      sawDecimal = true;
      continue;
    }

    if (allowNegative && !sawNegative && char === "-") {
      tokens += 1;
      sawNegative = true;
    }
  }

  return { tokens, sawDecimal, sawNegative };
}

function resolveCursorPosition(
  formattedValue: string,
  tokenCount: number,
  allowNegative = false,
  allowDecimal = false
) {
  if (tokenCount <= 0) return 0;

  let consumed = 0;
  let decimalCounted = false;
  let negativeCounted = false;

  for (let index = 0; index < formattedValue.length; index += 1) {
    const char = formattedValue[index];

    if (/\d/.test(char)) {
      consumed += 1;
    } else if (allowDecimal && !decimalCounted && char === ",") {
      consumed += 1;
      decimalCounted = true;
    } else if (allowNegative && !negativeCounted && char === "-") {
      consumed += 1;
      negativeCounted = true;
    }

    if (consumed >= tokenCount) {
      return index + 1;
    }
  }

  return formattedValue.length;
}

export function FormattedNumberInput({
  value,
  onValueChange,
  min,
  max,
  allowNegative,
  allowDecimal,
  maximumFractionDigits = 2,
  className,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatInputNumber(value, allowDecimal, maximumFractionDigits));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const nextSelectionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focused) {
      setText(formatInputNumber(value, allowDecimal, maximumFractionDigits));
    }
  }, [allowDecimal, focused, maximumFractionDigits, value]);

  useLayoutEffect(() => {
    if (nextSelectionRef.current === null) return;
    if (!inputRef.current) return;
    if (document.activeElement !== inputRef.current) {
      nextSelectionRef.current = null;
      return;
    }

    const nextSelection = nextSelectionRef.current;
    nextSelectionRef.current = null;
    inputRef.current.setSelectionRange(nextSelection, nextSelection);
  }, [text]);

  function clamp(nextValue: number) {
    let clamped = nextValue;
    if (typeof min === "number") clamped = Math.max(min, clamped);
    if (typeof max === "number") clamped = Math.min(max, clamped);
    return clamped;
  }

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={text}
      className={cn(className)}
      onFocus={(event) => {
        setFocused(true);
        setText(value ? formatInputNumber(value, allowDecimal, maximumFractionDigits) : "");
        onFocus?.(event);
      }}
      onChange={(event) => {
        const rawValue = event.target.value;
        if (!rawValue.trim()) {
          setText("");
          onValueChange(typeof min === "number" && min > 0 ? min : 0);
          return;
        }

        const nextValue = clamp(parseFormattedNumber(rawValue, allowNegative, allowDecimal, maximumFractionDigits));
        const formattedValue = formatInputNumber(nextValue, allowDecimal, maximumFractionDigits);
        const { tokens } = countCursorTokens(
          rawValue,
          event.target.selectionStart ?? rawValue.length,
          allowNegative,
          allowDecimal
        );
        nextSelectionRef.current = resolveCursorPosition(formattedValue, tokens, allowNegative, allowDecimal);
        setText(formattedValue);
        onValueChange(nextValue);
      }}
      onBlur={(event) => {
        setFocused(false);
        const nextValue = parseFormattedNumber(event.target.value, allowNegative, allowDecimal, maximumFractionDigits);
        const minValue = typeof min === "number" && nextValue === 0 ? min : nextValue;
        const finalValue = clamp(minValue);
        onValueChange(finalValue);
        setText(formatInputNumber(finalValue, allowDecimal, maximumFractionDigits));
        onBlur?.(event);
      }}
    />
  );
}
