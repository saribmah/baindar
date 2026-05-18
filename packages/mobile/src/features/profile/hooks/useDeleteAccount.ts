import { useCallback, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { authClient } from "../../auth";
import { useBillingStatus } from "../../billing";
import { useSdk } from "../../../sdk/sdk.provider";

type DeleteAccountState = {
  pending: boolean;
  // Presents a destructive confirmation. Walks the user through a
  // subscription warning (if applicable) and then two confirmation
  // prompts before issuing the SDK call.
  confirm: () => void;
};

// iOS deep link to the App Store account-level subscription manager.
// Works on a real device regardless of how the subscription was purchased.
const APPLE_MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
// Google Play subscription manager. Universal subscriptions URL on Android.
const GOOGLE_MANAGE_SUBSCRIPTIONS_URL = "https://play.google.com/store/account/subscriptions";

// Drives the destructive confirm flow. The server-side workflow handles
// binder/DO/R2/auth cleanup asynchronously; the client's job is only to
// initiate + confirm and to stop showing authenticated UI. When the user
// has a paid plan we surface an extra step explaining that the underlying
// platform subscription is NOT cancelled by deleting the Baindar account.
export function useDeleteAccount(): DeleteAccountState {
  const { client } = useSdk();
  const { billing } = useBillingStatus();
  const [pending, setPending] = useState(false);

  const confirm = useCallback(() => {
    if (pending) return;

    const hasActiveSubscription = billing != null && billing.plan !== "free";

    const presentFinalConfirm = () => {
      Alert.alert(
        "Are you sure?",
        "There is no undo. Your data is removed immediately and you will be signed out.",
        [
          { text: "Keep account", style: "cancel" },
          {
            text: "Delete my account",
            style: "destructive",
            onPress: () => {
              void runDelete();
            },
          },
        ],
      );
    };

    const presentDeleteConfirm = () => {
      Alert.alert(
        "Delete account?",
        "This will permanently delete your account and every document, highlight, note, and conversation in your binder. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: presentFinalConfirm,
          },
        ],
      );
    };

    if (hasActiveSubscription) {
      const platformLabel = Platform.OS === "ios" ? "the App Store" : "Google Play";
      const manageUrl =
        Platform.OS === "ios" ? APPLE_MANAGE_SUBSCRIPTIONS_URL : GOOGLE_MANAGE_SUBSCRIPTIONS_URL;
      Alert.alert(
        "Cancel your subscription first",
        `Your subscription is billed through ${platformLabel} and will not be cancelled by deleting your account. Open ${platformLabel} to manage or cancel it before continuing.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Open ${platformLabel}`,
            onPress: () => {
              void Linking.openURL(manageUrl);
            },
          },
          {
            text: "Continue to delete",
            style: "destructive",
            onPress: presentDeleteConfirm,
          },
        ],
      );
      return;
    }

    presentDeleteConfirm();

    async function runDelete() {
      setPending(true);
      try {
        const res = await client.account.delete();
        if (res.error) {
          Alert.alert(
            "Couldn't delete account",
            "Something went wrong. Please try again in a moment.",
          );
          return;
        }
        await authClient.signOut();
      } catch {
        Alert.alert(
          "Couldn't delete account",
          "Something went wrong. Please try again in a moment.",
        );
      } finally {
        setPending(false);
      }
    }
  }, [billing, client, pending]);

  return { pending, confirm };
}
