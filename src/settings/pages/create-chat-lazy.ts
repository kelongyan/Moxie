import { lazyComponent } from "../../lazy/lazy-component";
import { lazyModule } from "../../lazy/lazy-module";

// Create's chat loads when that settings page is opened. Warming Settings
// must not also load a second chat interface before the user needs it.
export const CreateChat = lazyComponent(
  lazyModule("create-chat", () => import("./CreateChat")),
  (m) => m.CreateChat,
);
