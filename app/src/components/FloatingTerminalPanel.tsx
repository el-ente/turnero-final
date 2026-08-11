import { useEffect } from "react";
import type { Terminal, Turn } from "shared";
import { STATUS_LABELS } from "../lib/turnStatusLabels";

interface FloatingTerminalPanelProps {
  pipWindow: Window;
  terminal: Terminal | null;
  currentTurn: Turn | null;
  confirmingNoShow: boolean;
  canCallNext: boolean;
  canStart: boolean;
  canFinish: boolean;
  canRecall: boolean;
  canNoShow: boolean;
  onCallNext: () => void;
  onStartTurn: () => void;
  onFinishTurn: () => void;
  onRecallTurn: () => void;
  onRequestNoShow: () => void;
  onConfirmNoShow: () => void;
  onCancelNoShow: () => void;
}

export function FloatingTerminalPanel({
  pipWindow,
  terminal,
  currentTurn,
  confirmingNoShow,
  canCallNext,
  canStart,
  canFinish,
  canRecall,
  canNoShow,
  onCallNext,
  onStartTurn,
  onFinishTurn,
  onRecallTurn,
  onRequestNoShow,
  onConfirmNoShow,
  onCancelNoShow,
}: FloatingTerminalPanelProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return; // ignore OS key-repeat while held
      switch (event.key.toLowerCase()) {
        case "l":
          if (canCallNext) onCallNext();
          break;
        case "i":
          if (canStart) onStartTurn();
          break;
        case "f":
          if (canFinish) onFinishTurn();
          break;
        case "r":
          if (canRecall) onRecallTurn();
          break;
        case "n":
          if (confirmingNoShow) onConfirmNoShow();
          else if (canNoShow) onRequestNoShow();
          break;
        case "escape":
          if (confirmingNoShow) onCancelNoShow();
          break;
      }
    };
    // Bound on the PiP document, not `window` — only fires once the user
    // has clicked into the floating widget, matching the agreed
    // click-then-hotkey model (no global OS capture).
    pipWindow.document.addEventListener("keydown", handleKeyDown);
    return () => pipWindow.document.removeEventListener("keydown", handleKeyDown);
  }, [
    pipWindow,
    confirmingNoShow,
    canCallNext,
    canStart,
    canFinish,
    canRecall,
    canNoShow,
    onCallNext,
    onStartTurn,
    onFinishTurn,
    onRecallTurn,
    onRequestNoShow,
    onConfirmNoShow,
    onCancelNoShow,
  ]);

  return (
    <div className="pip-panel">
      <div className="pip-header">
        <span className="pip-name">{terminal?.name ?? ""}</span>
        <span className={`pip-dot ${terminal?.status === "offline" ? "pip-dot-offline" : ""}`} />
      </div>

      <div className="pip-current">
        {currentTurn ? (
          <>
            <div className="pip-number">{currentTurn.memberNumber}</div>
            <span className="pip-status">{STATUS_LABELS[currentTurn.status] ?? currentTurn.status}</span>
          </>
        ) : (
          <div className="pip-empty">Sin turno asignado</div>
        )}
      </div>

      <div className="pip-actions">
        <button className="pip-btn pip-btn-primary" onClick={onCallNext} disabled={!canCallNext}>
          Llamar siguiente <kbd>L</kbd>
        </button>
        <button className="pip-btn" onClick={onStartTurn} disabled={!canStart}>
          Iniciar <kbd>I</kbd>
        </button>
        <button className="pip-btn pip-btn-success" onClick={onFinishTurn} disabled={!canFinish}>
          Finalizar <kbd>F</kbd>
        </button>
        <button className="pip-btn pip-btn-outline" onClick={onRecallTurn} disabled={!canRecall}>
          Re-llamar <kbd>R</kbd>
        </button>
        {confirmingNoShow ? (
          <div className="pip-noshow-confirm">
            <span>¿Seguro?</span>
            <button className="pip-btn pip-btn-danger" onClick={onConfirmNoShow}>
              Sí <kbd>N</kbd>
            </button>
            <button className="pip-btn pip-btn-outline" onClick={onCancelNoShow}>
              Cancelar <kbd>Esc</kbd>
            </button>
          </div>
        ) : (
          <button className="pip-btn pip-btn-danger" onClick={onRequestNoShow} disabled={!canNoShow}>
            No presentó <kbd>N</kbd>
          </button>
        )}
      </div>

      <style>{`
        .pip-panel { display: flex; flex-direction: column; gap: 0.85rem; padding: 1rem;
          font-family: var(--font-body); background: var(--bg); min-height: 100vh; }
        .pip-header { display: flex; align-items: center; justify-content: space-between; }
        .pip-name { font-weight: 600; color: var(--text); font-size: 0.85rem; }
        .pip-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--secondary); }
        .pip-dot-offline { background: var(--text-light); }
        .pip-current { display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 1rem; }
        .pip-number { font-family: var(--font-display); font-size: 2.75rem; font-weight: 900;
          color: var(--primary); line-height: 1; }
        .pip-status { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; }
        .pip-empty { color: var(--text-light); font-size: 0.85rem; }
        .pip-actions { display: flex; flex-direction: column; gap: 0.4rem; }
        .pip-btn { padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--surface); color: var(--text); font-weight: 600; font-size: 0.85rem;
          display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .pip-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .pip-btn-primary { background: var(--primary); border-color: var(--primary); color: white; }
        .pip-btn-success { background: var(--secondary); border-color: var(--secondary); color: white; }
        .pip-btn-outline, .pip-btn-danger { background: transparent; color: var(--text-muted); }
        .pip-btn-danger { color: var(--danger); }
        .pip-noshow-confirm { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.5rem;
          background: var(--danger-light); border-radius: var(--radius-sm); }
        kbd { font-size: 0.7rem; padding: 0.05rem 0.35rem; border: 1px solid var(--border);
          border-radius: 4px; color: var(--text-muted); }
        .pip-btn-primary kbd, .pip-btn-success kbd {
          border-color: rgba(255, 255, 255, 0.7); color: white; background: rgba(255, 255, 255, 0.18);
        }
      `}</style>
    </div>
  );
}
