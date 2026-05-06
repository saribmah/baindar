import { useEffect, type ReactNode } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@baindar/ui";
import { AgentsTestPage } from "./features/agents";
import { RequireAuth, SignIn, SignUp } from "./features/auth";
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

// HashRouter, not BrowserRouter — the prod bundle is loaded from
// views://mainview/index.html which has no HTML5 history server.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route element={<RequireAuth />}>
          <Route path="/agents-test" element={<AgentsTestPage />} />
          <Route element={<SignedInShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/shelves/:id" element={<ShelfDetail />} />
            <Route path="/library/:id" element={<LibraryDetail />} />
            <Route path="/highlights" element={<Highlights />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/read/:id" element={<Reader />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

function SignedInShell() {
  return (
    <ProfileProvider>
      <ThemedAppShell>
        <Outlet />
      </ThemedAppShell>
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
