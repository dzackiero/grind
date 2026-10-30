type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = { prompt: InstallPromptEvent | null; installed: boolean };
const initialState: InstallState = { prompt: null, installed: false };
let state = initialState;
const listeners = new Set<() => void>();

function update(next: InstallState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Captured by the root layout, so navigating to Settings doesn't lose the one-use browser event. */
export const pwaInstall = {
  getSnapshot: () => state,
  getServerSnapshot: () => initialState,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  start() {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    update({ prompt: standalone ? null : state.prompt, installed: standalone || state.installed });
    const onPrompt = (event: Event) => {
      event.preventDefault();
      update({ prompt: event as InstallPromptEvent, installed: false });
    };
    const onInstalled = () => update({ prompt: null, installed: true });
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  },
  async install() {
    const prompt = state.prompt;
    if (!prompt) return;
    // A prompt can only be used once, even after dismissal or an error.
    update({ ...state, prompt: null });
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // The browser menu instructions remain available if prompting fails.
    }
  },
};
