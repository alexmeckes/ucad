import { useEffect, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <div className={`drawer ${open ? "drawer-open" : ""}`}>
      <div className="drawer-header">
        <h3>{title}</h3>
        <button className="drawer-close" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </div>
  );
}
