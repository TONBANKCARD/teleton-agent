import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type SupportedLanguage } from "../i18n";

interface LanguageSwitcherProps {
  /** Render style: full-width block for the sidebar, or compact for headers/login. */
  variant?: "block" | "compact";
}

/**
 * Locale switcher (EN ↔ RU). The chosen language is persisted to localStorage
 * by the i18next language detector, so it survives reloads across every page.
 */
export function LanguageSwitcher({ variant = "block" }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();

  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : "en";

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    void i18n.changeLanguage(event.target.value);
  };

  return (
    <label
      className={`language-switcher language-switcher-${variant}`}
      style={
        variant === "block"
          ? { display: "flex", alignItems: "center", gap: "6px", width: "100%" }
          : { display: "inline-flex", alignItems: "center", gap: "6px" }
      }
    >
      <span className="sr-only">{t("language.label")}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <select
        value={current}
        onChange={handleChange}
        aria-label={t("language.label")}
        title={t("language.label")}
        style={{ flex: 1, fontSize: "13px" }}
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng}>
            {LANGUAGE_LABELS[lng]}
          </option>
        ))}
      </select>
    </label>
  );
}
