"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Validated categorical order (dataviz skill, `references/palette.md`) — do
 * not reorder or regenerate hues past slot 8; fold additional series into
 * "Other" instead. Light/dark are separately stepped, not a single flip.
 */
const CATEGORICAL_LIGHT = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

const CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

/** Sequential single-hue (blue) ramp, for magnitude-only series. */
const SEQUENTIAL_LIGHT = "#2a78d6";
const SEQUENTIAL_DARK = "#3987e5";

const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export interface ChartPalette {
  dark: boolean;
  categorical: string[];
  sequential: string;
  grid: string;
  axis: string;
  textSecondary: string;
  textMuted: string;
  status: typeof STATUS;
}

export function useChartPalette(): ChartPalette {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Theme is only knowable after hydration; this avoids an SSR/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const dark = mounted && resolvedTheme === "dark";

  return {
    dark,
    categorical: dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT,
    sequential: dark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT,
    grid: dark ? "#2c2c2a" : "#e1e0d9",
    axis: dark ? "#383835" : "#c3c2b7",
    textSecondary: dark ? "#c3c2b7" : "#52514e",
    textMuted: "#898781",
    status: STATUS,
  };
}
