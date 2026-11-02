"use client";
import { useEffect, useState } from "react";
export function Theme() {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    const saved = localStorage.getItem("prompt-studio-theme");
    if (saved && ["light", "dark", "system"].includes(saved)) setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("prompt-studio-theme", theme);
  }, [theme]);
  return (
    <label className="theme">
      Appearance
      <select
        aria-label="Appearance"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
