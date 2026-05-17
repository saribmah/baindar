import { Platform } from "react-native";

// Android emulator can't reach the host's "localhost" — it maps to itself.
// Use 10.0.2.2 as the default host alias. iOS sim and physical devices on the
// same LAN should override EXPO_PUBLIC_API_URL with the host's LAN IP.
const defaultHost = Platform.OS === "android" ? "10.0.2.2" : "localhost";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${defaultHost}:8787`;
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL ?? `${API_URL}/auth`;
export const AGENTS_HOST = process.env.EXPO_PUBLIC_AGENTS_HOST ?? API_URL;
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://baindar.com";
export const TERMS_URL = `${WEB_URL}/terms`;
export const PRIVACY_URL = `${WEB_URL}/privacy`;
