import { AppleMark, Button, GoogleMark } from "@baindar/ui";
import { authClient } from "../auth.client";

const signedInRedirectUrl = (): string => `${window.location.origin}/dashboard`;

export function SocialButtons() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button
        variant="secondary"
        size="lg"
        onClick={() =>
          authClient.signIn.social({ provider: "google", callbackURL: signedInRedirectUrl() })
        }
        iconStart={<GoogleMark />}
      >
        Continue with Google
      </Button>
      <Button
        size="lg"
        onClick={() =>
          authClient.signIn.social({ provider: "apple", callbackURL: signedInRedirectUrl() })
        }
        iconStart={<AppleMark />}
      >
        Continue with Apple
      </Button>
    </div>
  );
}
