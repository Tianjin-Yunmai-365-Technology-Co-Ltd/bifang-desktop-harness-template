import fs from "node:fs";
import path from "node:path";

export const FIXED_METADATA_LOCALE_RUNTIME_FIXTURE_SOURCE = String.raw`
mod sample_core {
    pub struct ScaffoldStatus {
        pub product_definition_required: bool,
    }

    pub async fn scaffold_status() -> ScaffoldStatus {
        ScaffoldStatus { product_definition_required: true }
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppMetadata {
    application_name: &'static str,
    version: &'static str,
    contact_channel: &'static str,
    contact_value: &'static str,
    product_definition_required: bool,
    title: String,
}

struct LocaleState {
    saved_language: std::sync::RwLock<Option<String>>,
}

impl LocaleState {
    fn saved_language(&self) -> Option<String> {
        self.saved_language.read().unwrap().clone()
    }

    fn set_saved_language(&self, language: String) {
        *self.saved_language.write().unwrap() = Some(language);
    }
}

#[tauri::command]
async fn get_app_metadata() -> AppMetadata {
    let status = sample_core::scaffold_status().await;
    let version = env!("CARGO_PKG_VERSION");
    AppMetadata {
        application_name: "Sample Application",
        version,
        contact_channel: "QQ",
        contact_value: "2222980",
        product_definition_required: status.product_definition_required,
        title: format!("Sample Application v{version} QQ:2222980"),
    }
}

#[tauri::command]
async fn get_system_locale(app: tauri::AppHandle) -> String {
    let state = app.state::<LocaleState>();
    resolve_system_locale(state.saved_language())
}

#[tauri::command]
async fn set_interface_language(
    language: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let state = app.state::<LocaleState>();
    let normalized = normalize_bcp47_locale(Some(language), None);
    state.set_saved_language(normalized.clone());
    rust_i18n::set_locale(&normalized);
    Ok(normalized)
}
`;

export function writeFixedFrontendIpcFixture(sourceRoot) {
  fs.mkdirSync(path.join(sourceRoot, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, "lib", "tauriCommands.ts"),
    `
import { invoke } from "@tauri-apps/api/core";

export interface AppMetadata {
  applicationName: string;
  version: string;
  contactChannel: string;
  contactValue: string;
  productDefinitionRequired: boolean;
  title: string;
}

export type InterfaceLanguage = "zh-CN" | "en-US";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(\`invalid \${field}\`);
  }
  return candidate;
}

export function decodeAppMetadata(value: unknown): AppMetadata {
  if (!isRecord(value) || typeof value.productDefinitionRequired !== "boolean") {
    throw new Error("invalid application metadata");
  }
  const applicationName = readString(value, "applicationName");
  const version = readString(value, "version");
  const contactChannel = readString(value, "contactChannel");
  const contactValue = readString(value, "contactValue");
  const title = readString(value, "title");
  return {
    applicationName,
    version,
    contactChannel,
    contactValue,
    productDefinitionRequired: value.productDefinitionRequired,
    title,
  };
}

export function decodeInterfaceLanguage(value: unknown): InterfaceLanguage {
  if (value !== "zh-CN" && value !== "en-US") {
    throw new Error("invalid interface language");
  }
  return value;
}

export async function getAppMetadata(): Promise<AppMetadata> {
  return decodeAppMetadata(await invoke<unknown>("get_app_metadata"));
}

export async function getSystemLocale(): Promise<InterfaceLanguage> {
  return decodeInterfaceLanguage(await invoke<unknown>("get_system_locale"));
}

export async function setInterfaceLanguage(
  language: InterfaceLanguage,
): Promise<InterfaceLanguage> {
  return decodeInterfaceLanguage(
    await invoke<unknown>("set_interface_language", { language }),
  );
}
`,
  );
  fs.writeFileSync(
    path.join(sourceRoot, "App.tsx"),
    `
import { useEffect, useState } from "react";

import {
  getAppMetadata,
  getSystemLocale,
  setInterfaceLanguage,
  type InterfaceLanguage,
} from "./lib/tauriCommands";

export function App() {
  const [language, setLanguage] = useState<InterfaceLanguage>("en-US");
  useEffect(() => {
    void getAppMetadata().then((metadata) => {
      document.title = metadata.title;
    });
    void getSystemLocale().then(setLanguage);
  }, []);
  const changeLanguage = async (nextLanguage: InterfaceLanguage) => {
    const authoritativeLanguage = await setInterfaceLanguage(nextLanguage);
    setLanguage(authoritativeLanguage);
  };
  return <button onClick={() => void changeLanguage(language)}>{language}</button>;
}
`,
  );
}
