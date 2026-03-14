const style: React.CSSProperties = {
  display: "inline-block",
  width: 16,
  height: 16,
  border: "2px solid var(--border)",
  borderTopColor: "var(--cyan)",
  borderRadius: "50%",
  animation: "spin 0.6s linear infinite",
};

export function Spinner() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={style} />
    </>
  );
}
