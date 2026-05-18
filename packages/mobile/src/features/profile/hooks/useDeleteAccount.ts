import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { authClient } from "../../auth";
import { useSdk } from "../../../sdk/sdk.provider";

type DeleteAccountState = {
  pending: boolean;
  // Presents a two-step confirmation. Resolves once the workflow has been
  // enqueued and the user has been signed out, or after the user cancels.
  confirm: () => void;
};

// Two-step confirmation that fires the SDK call, then signs the user out
// locally. The server-side workflow handles binder/DO/R2/auth cleanup
// asynchronously; the client's job is only to initiate + confirm and to
// stop showing authenticated UI.
export function useDeleteAccount(): DeleteAccountState {
  const { client } = useSdk();
  const [pending, setPending] = useState(false);

  const confirm = useCallback(() => {
    if (pending) return;
    Alert.alert(
      "Delete account?",
      "This will permanently delete your account and every document, highlight, note, and conversation in your binder. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
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
          },
        },
      ],
    );

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
  }, [client, pending]);

  return { pending, confirm };
}
