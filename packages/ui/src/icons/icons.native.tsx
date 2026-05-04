import { Circle, Path, Rect } from "react-native-svg";
import { Icon, type IconProps } from "./Icon.native.tsx";

export const Home = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 11.5L12 4l9 7.5" />
    <Path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" />
  </Icon>
);

export const Search = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="11" cy="11" r="7" />
    <Path d="M20 20l-3.5-3.5" />
  </Icon>
);

export const Library = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="4" y="4" width="4" height="16" rx="0.5" />
    <Rect x="10" y="4" width="4" height="16" rx="0.5" />
    <Path d="M16.5 4.7l3.3 0.9-3 14.6-3.3-0.9z" />
  </Icon>
);

export const Bookmark = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 3h12v18l-6-4-6 4z" />
  </Icon>
);

export const User = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="8" r="4" />
    <Path d="M4 21c1.5-4.5 5-6.5 8-6.5s6.5 2 8 6.5" />
  </Icon>
);

export const Close = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const Menu = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const Back = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const Chevron = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 6l6 6-6 6" />
  </Icon>
);

export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Icon>
);

export const Share = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="6" cy="12" r="2.2" />
    <Circle cx="18" cy="6" r="2.2" />
    <Circle cx="18" cy="18" r="2.2" />
    <Path d="M8 11l8-4M8 13l8 4" />
  </Icon>
);

export const Settings = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Icon>
);

export const Headphones = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 14v-2a9 9 0 0118 0v2" />
    <Path d="M3 14a2 2 0 012-2h2v6H5a2 2 0 01-2-2zM21 14a2 2 0 00-2-2h-2v6h2a2 2 0 002-2z" />
  </Icon>
);

export const BookOpen = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 5h6.5a2.5 2.5 0 012.5 2.5V20a2 2 0 00-2-2H3z" />
    <Path d="M21 5h-6.5A2.5 2.5 0 0012 7.5V20a2 2 0 012-2h7z" />
  </Icon>
);

export const Type = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 7V5h14v2M9 19h6M12 5v14" />
  </Icon>
);

export const Moon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M21 13.5A9 9 0 0110.5 3a7.5 7.5 0 1010.5 10.5z" />
  </Icon>
);

export const Sun = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="4" />
    <Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </Icon>
);

export const Sparkles = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
    <Path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8L16.5 18.5l1.8-.7z" />
  </Icon>
);

export const Mic = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="9" y="3" width="6" height="12" rx="3" />
    <Path d="M5 11a7 7 0 0014 0M12 18v3" />
  </Icon>
);

export const Highlight = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M14 4l6 6-9 9-3 1-1-3z" />
    <Path d="M5 21h14" />
  </Icon>
);

export const Copy = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="8" y="8" width="12" height="12" rx="2" />
    <Path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
  </Icon>
);

export const Note = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 4h11l3 3v13H5z" />
    <Path d="M9 10h6M9 14h6M9 18h4" />
  </Icon>
);

export const Send = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 12l16-8-6 16-2-7z" />
  </Icon>
);

export const Camera = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 7h3l2-2h6l2 2h3v12H4z" />
    <Circle cx="12" cy="13" r="3.5" />
  </Icon>
);

export const Bell = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 16V11a6 6 0 0112 0v5l1.5 2H4.5z" />
    <Path d="M10 21h4" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 12l5 5 9-11" />
  </Icon>
);

export const Filter = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
);

export const Quote = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M7 7c-2 1-3 3-3 5h3v5H4V12c0-3 1-5 3-6zm9 0c-2 1-3 3-3 5h3v5h-3V12c0-3 1-5 3-6z" />
  </Icon>
);

export const List = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 6h11M9 12h11M9 18h11" />
    <Circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <Circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <Circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const MoreVertical = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
    <Circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <Circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
  </Icon>
);

export const Trash = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 7h14M10 7V4h4v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" />
    <Path d="M10 11v7M14 11v7" />
  </Icon>
);

export const Pencil = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M14.5 4.5l5 5L8 21H3v-5z" />
    <Path d="M13 6l5 5" />
  </Icon>
);
