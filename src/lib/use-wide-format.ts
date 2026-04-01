"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "mardoc_wide_format";

export function useWideFormat() {
  const [wide, setWideState] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setWideState(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const setWide = useCallback((value: boolean) => {
    setWideState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }, []);

  const toggle = useCallback(() => {
    setWide(!wide);
  }, [wide, setWide]);

  const contentClass = wide
    ? "mx-auto px-12 py-8 relative"
    : "max-w-5xl mx-auto px-8 py-8 relative";

  return { wide, setWide, toggle, contentClass };
}
