import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function AdminModal({ title, onClose, children }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          animation: modal-fade 0.15s ease;
        }

        @keyframes modal-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal-card {
          width: 90%;
          max-width: 520px;
          max-height: 85vh;
          overflow-y: auto;
          background: var(--surface);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          animation: modal-slide 0.2s ease;
        }

        @keyframes modal-slide {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--border);
        }

        .modal-header h3 {
          font-family: var(--font-display);
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--text);
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.25rem;
          line-height: 1;
        }

        .modal-close:hover {
          color: var(--text);
        }

        .modal-body {
          padding: 1.5rem;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 0.375rem;
        }

        .form-input, .form-select {
          width: 100%;
          padding: 0.625rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-family: var(--font-body);
          font-size: 0.9rem;
          color: var(--text);
          background: var(--surface);
          transition: border-color 0.15s ease;
          box-sizing: border-box;
        }

        .form-input:focus, .form-select:focus {
          outline: none;
          border-color: var(--primary);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-check {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .form-check input {
          accent-color: var(--primary);
        }

        .form-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
        }

        .form-btn {
          padding: 0.6rem 1.25rem;
          border-radius: var(--radius-sm);
          font-family: var(--font-body);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .form-btn-cancel {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
        }

        .form-btn-cancel:hover {
          border-color: var(--text-light);
          color: var(--text);
        }

        .form-btn-save {
          background: var(--primary);
          border: none;
          color: white;
        }

        .form-btn-save:hover:not(:disabled) {
          background: var(--primary-hover);
        }

        .form-btn-save:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .form-btn-danger {
          background: var(--danger);
          border: none;
          color: white;
        }

        .form-btn-danger:hover {
          opacity: 0.9;
        }

        .form-multi-select {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          min-height: 2.5rem;
        }

        .form-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          font-size: 0.8rem;
          font-weight: 500;
          border-radius: 999px;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--surface-warm);
          color: var(--text-muted);
          transition: all 0.15s ease;
        }

        .form-chip.active {
          background: var(--primary-light);
          border-color: var(--primary);
          color: var(--primary);
        }
      `}</style>
    </div>
  );
}
