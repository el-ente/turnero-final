import { useEffect, useRef, useState } from "react";

const PIP_WINDOW_OPTIONS = { width: 360, height: 480 };

function cloneDocumentStyles(targetDocument: Document) {
  document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    targetDocument.head.appendChild(node.cloneNode(true));
  });
}

export function usePipWindow() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const isSupported = typeof window !== "undefined" && "documentPictureInPicture" in window;

  useEffect(() => {
    pipWindowRef.current = pipWindow;
  }, [pipWindow]);

  // Close the floating window if the owning view unmounts (route change away
  // from /terminal/:id) — otherwise the portal's source tree disappears while
  // the OS window stays open showing stale/frozen content.
  useEffect(() => {
    return () => {
      pipWindowRef.current?.close();
    };
  }, []);

  const openPipWindow = async () => {
    const pip = window.documentPictureInPicture;
    if (!pip) return;
    // requestWindow must be the first awaited call in this handler — it has
    // to run synchronously within the click gesture's call stack.
    const win = await pip.requestWindow(PIP_WINDOW_OPTIONS);
    cloneDocumentStyles(win.document);
    win.document.title = document.title;
    // Fires when the user closes the floating window via its native close
    // button (or the tab otherwise navigates it away).
    win.addEventListener("pagehide", () => setPipWindow(null), { once: true });
    setPipWindow(win);
  };

  return { isSupported, pipWindow, openPipWindow };
}
