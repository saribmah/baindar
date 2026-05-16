import { useEffect, type ReactNode } from "react";
import { Outlet, BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@baindar/ui";
import { RequireAuth, SignIn, SignUp } from "./features/auth";
import { BillingProvider, PlansPage, PlanUsagePage } from "./features/billing";
import { ConversationsPage } from "./features/conversations";
import { Dashboard } from "./features/dashboard";
import { Landing } from "./features/landing";
import { Highlights, Library, LibraryDetail, Notes, ShelfDetail } from "./features/library";
import {
  profileThemeToUi,
  ProfileProvider,
  SettingsPage,
  uiThemeToProfile,
  useProfile,
} from "./features/profile";
import { Reader } from "./features/reader";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route element={<RequireAuth />}>
          <Route element={<SignedInShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/conversations" element={<ConversationsPage />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/shelves/:id" element={<ShelfDetail />} />
            <Route path="/library/:id" element={<LibraryDetail />} />
            <Route path="/highlights" element={<Highlights />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/plan" element={<PlanUsagePage />} />
            <Route path="/read/:id" element={<Reader />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function SignedInShell() {
  return (
    <ProfileProvider>
      <BillingProvider>
        <ThemedAppShell>
          <Outlet />
        </ThemedAppShell>
      </BillingProvider>
    </ProfileProvider>
  );
}

function ThemedAppShell({ children }: { children: ReactNode }) {
  const { profile, update } = useProfile();
  const theme = profileThemeToUi(profile?.readingTheme);

  // Mirror to <html> so body/viewport area stays themed even outside the
  // wrapper div (e.g., during route transitions or scroll overflow).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeProvider
      theme={theme}
      onThemeChange={(next) => {
        void update({ readingTheme: uiThemeToProfile(next) });
      }}
    >
      {children}
    </ThemeProvider>
  );
}
