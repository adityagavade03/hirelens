import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Preference = "light" | "dark" | "system";
type Theme = "light" | "dark";
const key = "hirelens.theme";
const ThemeContext = createContext<{
  theme: Theme;
  preference: Preference;
  setPreference: (value: Preference) => void;
} | null>(null);
function readPreference(): Preference {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Theme selection still works when storage is blocked. */
  }
  return "system";
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>(readPreference);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const theme: Theme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null)
        setPreference(readPreference());
    };
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", change);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor =
      theme === "dark" ? "#171512" : "#f8f7f4";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#171512" : "#f8f7f4");
  }, [theme]);
  function choose(value: Preference) {
    setPreference(value);
    try {
      if (value === "system") localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* In-memory fallback. */
    }
  }
  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference: choose }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is required");
  return value;
}
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setPreference } = useTheme();
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onClick={() => setPreference(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
export function ThemeSettings() {
  const { preference, setPreference } = useTheme();
  return (
    <section
      className="panel appearance-panel"
      aria-labelledby="appearance-title"
    >
      <div>
        <div className="eyebrow">MAKE IT YOURS</div>
        <h2 id="appearance-title">Appearance</h2>
        <p>
          Choose a comfortable workspace. Your preference is saved on this
          browser.
        </p>
      </div>
      <div className="theme-options" role="group" aria-label="Colour theme">
        {(
          [
            { value: "light", label: "Light", Icon: Sun },
            { value: "dark", label: "Dark", Icon: Moon },
            { value: "system", label: "System", Icon: Monitor },
          ] as const
        ).map(({ value, label, Icon }) => (
          <button
            type="button"
            key={value}
            aria-pressed={preference === value}
            onClick={() => setPreference(value)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
