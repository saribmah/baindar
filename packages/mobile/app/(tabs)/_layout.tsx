import { Tabs } from "expo-router";
import { BottomTabs } from "../../src/features/shell";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BottomTabs {...props} />}>
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="conversations" />
      <Tabs.Screen name="highlights" />
      <Tabs.Screen name="notes" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
